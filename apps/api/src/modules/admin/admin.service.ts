// Admin and moderation (appendix-03, appendix-07 7.4). Every action needs a reason and writes an
// append-only moderation_actions row in the same transaction as the change.
import {
  MAX_SUSPENSION_DAYS,
  type AdminAuditDto,
  type AdminFlagDto,
  type AdminOverviewDto,
  type AdminQueueItemDto,
  type AdminUserDto,
} from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor } from "../../lib/pagination.js";
import { type Prisma, type PrismaClient } from "../../lib/prisma.js";
import type { SettingKey } from "../settings/settings.schema.js";
import { SETTINGS } from "../settings/settings.schema.js";
import type { SettingsService } from "../settings/settings.service.js";

export interface Actor {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}
type Role = Actor["role"];
const RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };
const DAY = 86_400_000;

const maskEmail = (e: string) => {
  const [local = "", domain = ""] = e.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};
const CATEGORY = (c: string) => c.toLowerCase().replace(/_/g, " ");

export function createAdminService(deps: { prisma: PrismaClient; clock: Clock; settings: SettingsService }) {
  const { prisma } = deps;
  const now = () => deps.clock.now();

  async function userDto(u: {
    id: string;
    fullName: string | null;
    email: string;
    role: string;
    status: string;
    strikeCount: number;
    prefs: unknown;
    createdAt: Date;
  }): Promise<AdminUserDto> {
    const until = (u.prefs as { suspendedUntil?: string } | null)?.suspendedUntil;
    return {
      id: u.id,
      name: u.fullName ?? "Member",
      emailMasked: maskEmail(u.email),
      role: u.role,
      status: u.status,
      strikeCount: u.strikeCount,
      suspendedUntil: u.status === "SUSPENDED" && until ? until : null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  /** Locks the target, checks the actor outranks it, and returns it. */
  async function lockTarget(tx: Prisma.TransactionClient, actor: Actor, targetId: string) {
    if (targetId === actor.userId) throw errors.forbidden("You can't do this to your own account.");
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${targetId}::uuid FOR UPDATE`;
    const t = await tx.user.findUnique({ where: { id: targetId } });
    if (!t || t.deletedAt) throw errors.notFound("We couldn't find that user.");
    if (RANK[t.role] >= RANK[actor.role])
      throw errors.forbidden("You can't act on someone with the same or a higher role.");
    return t;
  }

  async function audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: Prisma.ModerationActionUncheckedCreateInput["action"],
    targetType: string,
    targetId: string,
    reason: string,
    meta: Prisma.InputJsonValue = {},
  ) {
    await tx.moderationAction.create({ data: { actorId, action, targetType, targetId, reason, meta } });
  }

  return {
    async overview(): Promise<AdminOverviewDto> {
      const [
        reportsToReview,
        alertsToReview,
        openFlags,
        activeAlerts,
        openRides,
        activeJourneys,
        usersTotal,
        usersSuspended,
      ] = await Promise.all([
        prisma.report.count({ where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
        prisma.alert.count({ where: { status: "ACTIVE", needsReviewFirst: true } }),
        prisma.flag.count({ where: { status: "OPEN" } }),
        prisma.alert.count({ where: { status: { in: ["ACTIVE", "VERIFIED"] }, expiresAt: { gt: now() } } }),
        prisma.ride.count({ where: { status: { in: ["OPEN", "FULL"] }, departureAt: { gt: now() } } }),
        prisma.journey.count({ where: { status: { in: ["ACTIVE", "OVERDUE"] } } }),
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { status: { in: ["SUSPENDED", "BANNED"] } } }),
      ]);
      return {
        reportsToReview,
        alertsToReview,
        openFlags,
        activeAlerts,
        openRides,
        activeJourneys,
        usersTotal,
        usersSuspended,
      };
    },

    async queue(tab: "reports" | "alerts" | "rides" | "users", q: { cursor?: string | undefined; limit: number }) {
      const flagCounts = async (type: "REPORT" | "ALERT" | "RIDE" | "USER", ids: string[]) => {
        const rows = await prisma.flag.groupBy({
          by: ["targetId"],
          where: { targetType: type, status: "OPEN", targetId: { in: ids } },
          _count: { _all: true },
        });
        return new Map(rows.map((r) => [r.targetId, r._count._all]));
      };
      if (tab === "reports" || tab === "alerts") {
        const cursor = afterCursor(decodeCursor(q.cursor));
        if (tab === "reports") {
          const rows = await prisma.report.findMany({
            where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, ...cursor },
            orderBy: cursorOrderBy,
            take: q.limit + 1,
          });
          const fc = await flagCounts(
            "REPORT",
            rows.map((r) => r.id),
          );
          return buildCursorPage(rows, q.limit, (r): AdminQueueItemDto => ({
            id: r.id,
            kind: "report",
            title: r.title,
            subtitle: `${CATEGORY(r.category)} · ${r.addressText ?? "No address"}`,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            openFlags: fc.get(r.id) ?? 0,
          }));
        }
        const rows = await prisma.alert.findMany({
          where: { status: "ACTIVE", ...cursor },
          orderBy: cursorOrderBy,
          take: q.limit + 1,
        });
        const fc = await flagCounts(
          "ALERT",
          rows.map((r) => r.id),
        );
        return buildCursorPage(rows, q.limit, (r): AdminQueueItemDto => ({
          id: r.id,
          kind: "alert",
          title: `Unverified ${CATEGORY(r.category)}`,
          subtitle: r.addressText,
          status: r.needsReviewFirst ? "AWAITING_REVIEW" : r.status,
          createdAt: r.createdAt.toISOString(),
          openFlags: fc.get(r.id) ?? 0,
        }));
      }
      // Rides and users appear in the queue when they have open flags.
      const type = tab === "rides" ? "RIDE" : "USER";
      const grouped = await prisma.flag.groupBy({
        by: ["targetId"],
        where: { targetType: type, status: "OPEN" },
        _count: { _all: true },
        orderBy: { _count: { targetId: "desc" } },
        take: q.limit,
      });
      const ids = grouped.map((g) => g.targetId);
      const counts = new Map(grouped.map((g) => [g.targetId, g._count._all]));
      if (tab === "rides") {
        const rows = await prisma.ride.findMany({ where: { id: { in: ids } } });
        return {
          data: rows.map((r): AdminQueueItemDto => ({
            id: r.id,
            kind: "ride",
            title: `${r.sourceText} to ${r.destText}`,
            subtitle: r.departureAt.toISOString(),
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            openFlags: counts.get(r.id) ?? 0,
          })),
          meta: { nextCursor: null },
        };
      }
      const rows = await prisma.user.findMany({ where: { id: { in: ids } } });
      return {
        data: rows.map((u): AdminQueueItemDto => ({
          id: u.id,
          kind: "user",
          title: u.fullName ?? "Member",
          subtitle: maskEmail(u.email),
          status: u.status,
          createdAt: u.createdAt.toISOString(),
          openFlags: counts.get(u.id) ?? 0,
        })),
        meta: { nextCursor: null },
      };
    },

    async flags(q: {
      status: "OPEN" | "ACTIONED" | "DISMISSED";
      targetType?: string | undefined;
      cursor?: string | undefined;
      limit: number;
    }) {
      const rows = await prisma.flag.findMany({
        where: {
          status: q.status,
          ...(q.targetType ? { targetType: q.targetType as "REPORT" } : {}),
          ...afterCursor(decodeCursor(q.cursor)),
        },
        orderBy: cursorOrderBy,
        take: q.limit + 1,
      });
      return buildCursorPage(rows, q.limit, (f): AdminFlagDto => ({
        id: f.id,
        targetType: f.targetType,
        targetId: f.targetId,
        reason: f.reason,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
        resolutionNote: f.resolutionNote,
      }));
    },

    async resolveFlag(actor: Actor, id: string, input: { status: "ACTIONED" | "DISMISSED"; note: string }) {
      await prisma.$transaction(async (tx) => {
        const r = await tx.flag.updateMany({
          where: { id, status: "OPEN" },
          data: { status: input.status, resolvedBy: actor.userId, resolutionNote: input.note },
        });
        if (r.count === 0) {
          if (!(await tx.flag.findUnique({ where: { id } }))) throw errors.notFound("We couldn't find that flag.");
          throw errors.conflict("This flag was already handled.");
        }
        const f = await tx.flag.findUniqueOrThrow({ where: { id } });
        await audit(tx, actor.userId, "FLAG_RESOLVE", f.targetType, f.targetId, input.note, {
          flagId: id,
          status: input.status,
        });
      });
      return { ok: true as const };
    },

    async users(q: {
      q?: string | undefined;
      status?: string | undefined;
      role?: string | undefined;
      cursor?: string | undefined;
      limit: number;
    }) {
      const rows = await prisma.user.findMany({
        where: {
          deletedAt: null,
          ...(q.status ? { status: q.status as "ACTIVE" } : {}),
          ...(q.role ? { role: q.role as "USER" } : {}),
          ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: "insensitive" } }, { email: { equals: q.q } }] } : {}),
          ...afterCursor(decodeCursor(q.cursor)),
        },
        orderBy: cursorOrderBy,
        take: q.limit + 1,
      });
      const page = buildCursorPage(rows, q.limit, (r) => r);
      return { data: await Promise.all(page.data.map(userDto)), meta: page.meta };
    },

    async suspend(actor: Actor, targetId: string, input: { reason: string; until: string }) {
      const until = new Date(input.until);
      const days = (until.getTime() - now().getTime()) / DAY;
      if (days <= 0) throw errors.validation([{ field: "until", message: "Pick a date in the future." }]);
      const maxDays = actor.role === "ADMIN" ? 365 : MAX_SUSPENSION_DAYS;
      if (days > maxDays) throw errors.validation([{ field: "until", message: `Pick a date within ${maxDays} days.` }]);
      await prisma.$transaction(async (tx) => {
        const t = await lockTarget(tx, actor, targetId);
        if (t.status === "BANNED") throw errors.conflict("This user is banned.");
        const prefs = { ...((t.prefs as object) ?? {}), suspendedUntil: until.toISOString() };
        await tx.user.update({ where: { id: targetId }, data: { status: "SUSPENDED", prefs } });
        await tx.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: now() } });
        await audit(tx, actor.userId, "SUSPEND", "USER", targetId, input.reason, { until: until.toISOString() });
      });
      return { ok: true as const };
    },

    async ban(actor: Actor, targetId: string, reason: string) {
      if (actor.role !== "ADMIN") throw errors.forbidden("Only admins can ban users.");
      await prisma.$transaction(async (tx) => {
        const t = await lockTarget(tx, actor, targetId);
        if (t.status === "BANNED") throw errors.conflict("This user is already banned.");
        await tx.user.update({ where: { id: targetId }, data: { status: "BANNED" } });
        await tx.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: now() } });
        await audit(tx, actor.userId, "BAN", "USER", targetId, reason);
      });
      return { ok: true as const };
    },

    async restore(actor: Actor, targetId: string, reason: string) {
      await prisma.$transaction(async (tx) => {
        const t = await lockTarget(tx, actor, targetId);
        if (t.status === "ACTIVE") throw errors.conflict("This user is already active.");
        if (t.status === "BANNED" && actor.role !== "ADMIN")
          throw errors.forbidden("Only admins can restore a banned user.");
        const { suspendedUntil: _drop, ...prefs } = ((t.prefs as Record<string, unknown>) ?? {}) as Record<
          string,
          unknown
        >;
        void _drop;
        await tx.user.update({
          where: { id: targetId },
          data: { status: "ACTIVE", prefs: prefs as Prisma.InputJsonValue },
        });
        await audit(tx, actor.userId, "RESTORE", "USER", targetId, reason);
      });
      return { ok: true as const };
    },

    async changeRole(actor: Actor, targetId: string, input: { role: Role; reason: string }) {
      if (actor.role !== "ADMIN") throw errors.forbidden("Only admins can change roles.");
      if (targetId === actor.userId) throw errors.forbidden("You can't change your own role.");
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${targetId}::uuid FOR UPDATE`;
        const t = await tx.user.findUnique({ where: { id: targetId } });
        if (!t || t.deletedAt) throw errors.notFound("We couldn't find that user.");
        if (t.role === input.role) throw errors.conflict("They already have that role.");
        await tx.user.update({ where: { id: targetId }, data: { role: input.role } });
        await audit(tx, actor.userId, "ROLE_CHANGE", "USER", targetId, input.reason, { from: t.role, to: input.role });
      });
      return { ok: true as const };
    },

    async audit(q: {
      action?: string | undefined;
      actorId?: string | undefined;
      cursor?: string | undefined;
      limit: number;
    }) {
      const rows = await prisma.moderationAction.findMany({
        where: {
          ...(q.action ? { action: q.action as "VERIFY" } : {}),
          ...(q.actorId ? { actorId: q.actorId } : {}),
          ...afterCursor(decodeCursor(q.cursor)),
        },
        orderBy: cursorOrderBy,
        take: q.limit + 1,
        include: { actor: { select: { fullName: true } } },
      });
      return buildCursorPage(rows, q.limit, (a): AdminAuditDto => ({
        id: a.id,
        actorName: a.actor.fullName ?? "Moderator",
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      }));
    },

    async getSettings() {
      return deps.settings.all();
    },

    async updateSetting(actor: Actor, key: SettingKey, value: unknown, reason: string) {
      if (!(key in SETTINGS)) throw errors.notFound("Unknown setting.");
      const before = await deps.settings.get(key);
      const parsed = SETTINGS[key].schema.safeParse(value);
      if (!parsed.success) {
        throw errors.validation(
          parsed.error.issues.map((i) => ({ field: i.path.join(".") || "value", message: i.message })),
        );
      }
      await prisma.$transaction(async (tx) => {
        await audit(tx, actor.userId, "SETTINGS_CHANGE", "SETTING", key, reason, {
          before: before as Prisma.InputJsonValue,
          after: parsed.data as Prisma.InputJsonValue,
        });
      });
      await deps.settings.set(key, parsed.data as never, actor.userId);
      return { key, value: parsed.data };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
