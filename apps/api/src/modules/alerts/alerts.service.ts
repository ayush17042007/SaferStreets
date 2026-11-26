// SafeAlert (appendix-02 2D). Community alerts, always Unverified until a moderator verifies.
import {
  GUEST_COORD_STEP,
  bboxAround,
  haversineMeters,
  inRegion,
  type AlertDto,
  type AlertStatusChange,
  type AlertSubscriptionDto,
  type AlertSubscriptionInput,
  type CreateAlert,
  type ListAlertsQuery,
} from "@saferstreets/shared";
import type { JobPublisher } from "../../jobs/publisher.js";
import { JOB_NAMES } from "../../jobs/registry.js";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor } from "../../lib/pagination.js";
import { type Prisma, type PrismaClient } from "../../lib/prisma.js";
import type { NotificationService } from "../notifications/notifications.service.js";
import type { SettingsService } from "../settings/settings.service.js";

export interface AlertViewer {
  userId?: string | undefined;
  role?: "USER" | "MODERATOR" | "ADMIN" | undefined;
}
const isStaff = (v: AlertViewer) => v.role === "MODERATOR" || v.role === "ADMIN";
const HOUR = 3_600_000;
const SUSPENSION_DAYS = 30;
const REVIEW_FIRST_DAYS = 7;
const num = (d: { toString(): string } | number) => Number(d);
const coarse = (n: number) => Math.round(n / GUEST_COORD_STEP) * GUEST_COORD_STEP;

type Row = Prisma.AlertGetPayload<object>;

export function createAlertsService(deps: {
  prisma: PrismaClient;
  clock: Clock;
  settings: SettingsService;
  notifications: NotificationService;
  publisher: Pick<JobPublisher, "enqueue">;
}) {
  const { prisma } = deps;
  const now = () => deps.clock.now();

  async function visibleWhere(v: AlertViewer): Promise<Prisma.AlertWhereInput> {
    if (isStaff(v)) return {};
    const open: Prisma.AlertWhereInput = {
      status: { in: ["ACTIVE", "VERIFIED", "RESOLVED"] },
      needsReviewFirst: false,
    };
    return v.userId ? { OR: [open, { authorId: v.userId }] } : open;
  }

  async function toDto(a: Row, v: AlertViewer): Promise<AlertDto> {
    const guest = !v.userId;
    const mine = v.userId === a.authorId;
    const vote = v.userId
      ? await prisma.alertVote.findUnique({ where: { alertId_userId: { alertId: a.id, userId: v.userId } } })
      : null;
    const live = a.status === "ACTIVE" || a.status === "VERIFIED";
    return {
      id: a.id,
      category: a.category,
      status: a.status,
      unverified: a.status !== "VERIFIED",
      description: guest ? null : a.description,
      addressText: guest ? null : a.addressText,
      latitude: guest ? coarse(num(a.latitude)) : num(a.latitude),
      longitude: guest ? coarse(num(a.longitude)) : num(a.longitude),
      coarseLocation: guest,
      confirmCount: a.confirmCount,
      disputeCount: a.disputeCount,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt.toISOString(),
      isMine: mine,
      myVote: vote?.vote ?? null,
      awaitingReview: a.needsReviewFirst && a.status === "ACTIVE",
      canResolve: live && (mine || isStaff(v)),
      canVote: Boolean(v.userId) && !mine && live && !a.needsReviewFirst,
    };
  }

  async function load(id: string, v: AlertViewer): Promise<Row> {
    const a = await prisma.alert.findFirst({ where: { id, ...(await visibleWhere(v)) } });
    if (!a) throw errors.notFound("We couldn't find that alert.");
    return a;
  }

  async function postingBlock(userId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.status !== "ACTIVE") return "Your account can't post alerts right now.";
    if (!u.emailVerifiedAt) return "Verify your email to post alerts.";
    const t = await deps.settings.get("thresholds");
    if (now().getTime() - u.createdAt.getTime() < t.alertMinAccountAgeHours * HOUR) {
      return `Alerts open ${t.alertMinAccountAgeHours} hours after you join.`;
    }
    if (u.alertsSuspendedUntil && u.alertsSuspendedUntil.getTime() > now().getTime()) {
      return "Your alert posting is paused after several dismissed alerts.";
    }
    return null;
  }

  return {
    async create(userId: string, input: CreateAlert): Promise<AlertDto> {
      const blocked = await postingBlock(userId);
      if (blocked) throw errors.forbidden(blocked);
      const region = await deps.settings.get("serviceRegion");
      if (!inRegion({ lat: input.latitude, lng: input.longitude }, region)) {
        throw errors.validation([{ field: "latitude", message: "That spot is outside the area SaferStreets covers." }]);
      }
      const t = await deps.settings.get("thresholds");
      const box = bboxAround({ lat: input.latitude, lng: input.longitude }, t.duplicateAlertRadiusM / 1000);
      const recent = await prisma.alert.findMany({
        where: {
          category: input.category,
          status: { in: ["ACTIVE", "VERIFIED"] },
          createdAt: { gte: new Date(now().getTime() - t.duplicateAlertWindowMinutes * 60_000) },
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLng, lte: box.maxLng },
        },
        select: { latitude: true, longitude: true },
      });
      const dup = recent.some(
        (r) =>
          haversineMeters(
            { lat: input.latitude, lng: input.longitude },
            { lat: num(r.latitude), lng: num(r.longitude) },
          ) <= t.duplicateAlertRadiusM,
      );
      if (dup) throw errors.conflict("A similar alert was already posted nearby. Confirm that one instead.");

      const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const needsReview = now().getTime() - u.createdAt.getTime() < REVIEW_FIRST_DAYS * 24 * HOUR;
      const alert = await prisma.alert.create({
        data: {
          authorId: userId,
          category: input.category,
          description: input.description,
          latitude: input.latitude,
          longitude: input.longitude,
          addressText: input.addressText,
          isAnonymous: input.isAnonymous,
          needsReviewFirst: needsReview,
          expiresAt: new Date(now().getTime() + t.alertExpiryHours * HOUR),
        },
      });
      if (!needsReview) await deps.publisher.enqueue(JOB_NAMES.alertFanout, { alertId: alert.id });
      return toDto(alert, { userId });
    },

    async list(v: AlertViewer, q: ListAlertsQuery) {
      const where: Prisma.AlertWhereInput[] = [
        await visibleWhere(v),
        { status: { in: ["ACTIVE", "VERIFIED"] }, expiresAt: { gt: now() } },
        ...(q.category ? [{ category: q.category }] : []),
      ];
      const centre = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
      const radius = q.radiusKm ?? 10;
      if (centre) {
        const b = bboxAround(centre, radius);
        where.push({ latitude: { gte: b.minLat, lte: b.maxLat }, longitude: { gte: b.minLng, lte: b.maxLng } });
      }
      const kept: Row[] = [];
      let cursor = decodeCursor(q.cursor);
      for (let guard = 0; guard < 10 && kept.length <= q.limit; guard++) {
        const rows = await prisma.alert.findMany({
          where: { AND: [...where, afterCursor(cursor)] },
          orderBy: cursorOrderBy,
          take: q.limit + 1,
        });
        for (const r of rows) {
          if (!centre || haversineMeters(centre, { lat: num(r.latitude), lng: num(r.longitude) }) <= radius * 1000)
            kept.push(r);
        }
        const more = rows.length > q.limit;
        const last = rows[rows.length - 1];
        if (!more || !last) break;
        cursor = { createdAt: last.createdAt, id: last.id };
      }
      const page = buildCursorPage(kept, q.limit, (r) => r);
      return { data: await Promise.all(page.data.map((r) => toDto(r, v))), meta: page.meta };
    },

    async detail(id: string, v: AlertViewer): Promise<AlertDto> {
      return toDto(await load(id, v), v);
    },

    async vote(userId: string, id: string, vote: "CONFIRM" | "DISPUTE"): Promise<AlertDto> {
      const a = await load(id, { userId });
      if (a.authorId === userId) throw errors.forbidden("You can't vote on your own alert.");
      if ((a.status !== "ACTIVE" && a.status !== "VERIFIED") || a.needsReviewFirst) {
        throw errors.conflict("This alert is no longer open for votes.");
      }
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alerts WHERE id = ${id}::uuid FOR UPDATE`;
        await tx.alertVote.upsert({
          where: { alertId_userId: { alertId: id, userId } },
          create: { alertId: id, userId, vote },
          update: { vote },
        });
        const [confirm, dispute] = await Promise.all([
          tx.alertVote.count({ where: { alertId: id, vote: "CONFIRM" } }),
          tx.alertVote.count({ where: { alertId: id, vote: "DISPUTE" } }),
        ]);
        await tx.alert.update({ where: { id }, data: { confirmCount: confirm, disputeCount: dispute } });
      });
      return toDto(await load(id, { userId }), { userId });
    },

    async unvote(userId: string, id: string): Promise<AlertDto> {
      await load(id, { userId });
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alerts WHERE id = ${id}::uuid FOR UPDATE`;
        await tx.alertVote.deleteMany({ where: { alertId: id, userId } });
        const [confirm, dispute] = await Promise.all([
          tx.alertVote.count({ where: { alertId: id, vote: "CONFIRM" } }),
          tx.alertVote.count({ where: { alertId: id, vote: "DISPUTE" } }),
        ]);
        await tx.alert.update({ where: { id }, data: { confirmCount: confirm, disputeCount: dispute } });
      });
      return toDto(await load(id, { userId }), { userId });
    },

    async resolve(v: Required<Pick<AlertViewer, "userId">> & AlertViewer, id: string): Promise<AlertDto> {
      const a = await load(id, v);
      if (a.authorId !== v.userId && !isStaff(v)) throw errors.notFound("We couldn't find that alert.");
      const r = await prisma.alert.updateMany({
        where: { id, status: { in: ["ACTIVE", "VERIFIED"] } },
        data: { status: "RESOLVED", resolvedAt: now() },
      });
      if (r.count === 0) throw errors.conflict("This alert has already ended.");
      return toDto(await load(id, v), v);
    },

    /** Moderator action. Verify unlocks review-first alerts; dismiss gives the author a strike. */
    async changeStatus(actorId: string, id: string, input: AlertStatusChange): Promise<AlertDto> {
      const t = await deps.settings.get("thresholds");
      let fanout = false;
      const flushes: Array<() => Promise<void>> = [];
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alerts WHERE id = ${id}::uuid FOR UPDATE`;
        const a = await tx.alert.findUnique({ where: { id } });
        if (!a) throw errors.notFound("We couldn't find that alert.");
        const live = a.status === "ACTIVE" || a.status === "VERIFIED";
        if (input.status === "VERIFIED" && a.status !== "ACTIVE")
          throw errors.conflict("Only an active alert can be verified.");
        if (input.status === "DISMISSED" && !live) throw errors.conflict("This alert has already ended.");
        if (input.status === "REMOVED" && a.status === "REMOVED")
          throw errors.conflict("This alert was already removed.");

        fanout = input.status === "VERIFIED" && a.needsReviewFirst;
        await tx.alert.update({
          where: { id },
          data: {
            status: input.status,
            ...(input.status === "VERIFIED" ? { verifiedBy: actorId, needsReviewFirst: false } : {}),
          },
        });
        const action = { VERIFIED: "VERIFY", DISMISSED: "DISMISS", REMOVED: "REMOVE" } as const;
        await tx.moderationAction.create({
          data: {
            actorId,
            action: action[input.status],
            targetType: "ALERT",
            targetId: id,
            reason: input.reason,
            meta: { from: a.status, to: input.status },
          },
        });
        if (input.status === "DISMISSED") {
          const author = await tx.user.update({ where: { id: a.authorId }, data: { strikeCount: { increment: 1 } } });
          await tx.moderationAction.create({
            data: {
              actorId,
              action: "STRIKE",
              targetType: "USER",
              targetId: a.authorId,
              reason: input.reason,
              meta: { alertId: id, strikes: author.strikeCount },
            },
          });
          let body = "A moderator dismissed your alert. Dismissed alerts count as strikes.";
          if (author.strikeCount >= t.alertDismissStrikeLimit) {
            const until = new Date(now().getTime() + SUSPENSION_DAYS * 24 * HOUR);
            await tx.user.update({ where: { id: a.authorId }, data: { alertsSuspendedUntil: until } });
            await tx.moderationAction.create({
              data: {
                actorId,
                action: "SUSPEND",
                targetType: "USER",
                targetId: a.authorId,
                reason: "Alert posting paused after repeated dismissed alerts",
                meta: { until: until.toISOString() },
              },
            });
            body = `${body} You can't post alerts for ${SUSPENSION_DAYS} days.`;
          }
          const n = await deps.notifications.create(tx, {
            userId: a.authorId,
            type: "ALERT_UPDATE",
            module: "safealert",
            title: "Your alert was dismissed",
            body,
          });
          flushes.push(n.flush);
        } else if (input.status === "VERIFIED") {
          const n = await deps.notifications.create(tx, {
            userId: a.authorId,
            type: "ALERT_UPDATE",
            module: "safealert",
            title: "Your alert was verified",
            body: "A moderator verified your alert.",
            link: `/safealert/${id}`,
          });
          flushes.push(n.flush);
        }
      });
      for (const f of flushes) await f();
      if (fanout) await deps.publisher.enqueue(JOB_NAMES.alertFanout, { alertId: id });
      const a = await prisma.alert.findUniqueOrThrow({ where: { id } });
      return toDto(a, { userId: actorId, role: "MODERATOR" });
    },

    async getSubscription(userId: string): Promise<AlertSubscriptionDto> {
      const s = await prisma.alertSubscription.findUnique({ where: { userId } });
      const reason = await postingBlock(userId);
      return {
        enabled: s?.enabled ?? false,
        sosNearbyOptIn: s?.sosNearbyOptIn ?? false,
        centerLat: s?.centerLat ? num(s.centerLat) : null,
        centerLng: s?.centerLng ? num(s.centerLng) : null,
        radiusKm: s?.radiusKm ?? 3,
        categories: s?.categories ?? [],
        emailEnabled: s?.emailEnabled ?? true,
        canPost: reason === null,
        canPostReason: reason,
      };
    },

    async putSubscription(userId: string, input: AlertSubscriptionInput): Promise<AlertSubscriptionDto> {
      const data = {
        enabled: input.enabled,
        ...(input.sosNearbyOptIn !== undefined ? { sosNearbyOptIn: input.sosNearbyOptIn } : {}),
        centerLat: input.centerLat,
        centerLng: input.centerLng,
        radiusKm: input.radiusKm,
        categories: input.categories,
        emailEnabled: input.emailEnabled,
      };
      await prisma.alertSubscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      return this.getSubscription(userId);
    },
  };
}

export type AlertsService = ReturnType<typeof createAlertsService>;
