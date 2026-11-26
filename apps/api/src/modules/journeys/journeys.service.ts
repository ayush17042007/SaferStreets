// JourneyGuard (appendix-02 2C). Honest scope: an expected arrival time, one reminder to the user and
// one email to a trusted contact. No live location, no authority contact.
import { randomUUID } from "node:crypto";
import {
  ESCALATION_MINUTES_DEFAULT,
  MAX_ETA_HOURS,
  MAX_EXTENSIONS,
  MIN_ETA_MINUTES,
  OVERDUE_AFTER_MINUTES,
  haversineKm,
  type JourneyDto,
  type JourneySafetyState,
  type LocationUpdateInput,
  type StartJourney,
  type TrackDto,
} from "@saferstreets/shared";
import { distanceToPolylineM } from "../reports/saferoute.scoring.js";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor } from "../../lib/pagination.js";
import { Prisma, type PrismaClient } from "../../lib/prisma.js";
import type { EmailService } from "../mail/email.service.js";
import {
  deriveTrackToken,
  firstNameOf,
  hashTrackToken,
  queueContactEmail,
  trackUrl,
  type JourneyEnv,
} from "./journeys.mail.js";

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

type Row = Prisma.JourneyGetPayload<{
  include: { emergencyContact: { select: { id: true; name: true; relationship: true; unsubscribedAt: true } } };
}>;

export function createJourneysService(deps: {
  prisma: PrismaClient;
  clock: Clock;
  email: EmailService;
  env: JourneyEnv;
  log: { error: (o: object, m: string) => void };
}) {
  const { prisma, clock } = deps;
  const now = () => clock.now();
  const include = {
    emergencyContact: { select: { id: true, name: true, relationship: true, unsubscribedAt: true } },
  } as const;

  async function emailFailed(j: Row): Promise<boolean> {
    if (!j.contactNotifiedAt) return false;
    const ev = await prisma.journeyEvent.findFirst({
      where: { journeyId: j.id, type: "CONTACT_NOTIFIED" },
      orderBy: { createdAt: "desc" },
    });
    const meta = (ev?.meta ?? {}) as { delivery?: string; emailEventId?: string };
    if (meta.delivery === "FAILED") return true;
    if (meta.emailEventId) {
      const e = await prisma.emailEvent.findUnique({ where: { id: meta.emailEventId }, select: { status: true } });
      return e?.status === "FAILED";
    }
    return false;
  }

  async function toDto(j: Row, withUrl = false): Promise<JourneyDto> {
    const eta = j.expectedArrivalAt.getTime();
    const ev = j.contactNotifiedAt
      ? await prisma.journeyEvent.findFirst({
          where: { journeyId: j.id, type: "CONTACT_NOTIFIED" },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const optedOut = (ev?.meta as { delivery?: string } | undefined)?.delivery === "OPTED_OUT";
    return {
      id: j.id,
      destinationText: j.destinationText,
      destLat: j.destLat !== null ? Number(j.destLat) : null,
      destLng: j.destLng !== null ? Number(j.destLng) : null,
      startText: j.startText,
      startLat: j.startLat !== null ? Number(j.startLat) : null,
      startLng: j.startLng !== null ? Number(j.startLng) : null,
      trackingEnabled: j.trackingEnabled,
      routeGeometry: (j.routeGeometry as Array<[number, number]> | null) ?? null,
      lastLat: j.lastLat !== null ? Number(j.lastLat) : null,
      lastLng: j.lastLng !== null ? Number(j.lastLng) : null,
      lastLocationAt: j.lastLocationAt?.toISOString() ?? null,
      safetyState: (j.safetyState as JourneySafetyState) ?? "NORMAL",
      sosTriggeredAt: j.sosTriggeredAt?.toISOString() ?? null,
      notes: j.notes,
      startedAt: j.startedAt.toISOString(),
      expectedArrivalAt: j.expectedArrivalAt.toISOString(),
      overdueAfterAt: new Date(eta + OVERDUE_AFTER_MINUTES * MIN_MS).toISOString(),
      escalationAt: new Date(eta + j.escalationMinutes * MIN_MS).toISOString(),
      escalationMinutes: j.escalationMinutes,
      status: j.status,
      extensionsUsed: j.extensionsUsed,
      extensionsLeft: Math.max(0, MAX_EXTENSIONS - j.extensionsUsed),
      overdueAt: j.overdueAt?.toISOString() ?? null,
      contactNotifiedAt: j.contactNotifiedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      contact: j.emergencyContact
        ? { id: j.emergencyContact.id, name: j.emergencyContact.name, relationship: j.emergencyContact.relationship }
        : null,
      contactEmailFailed: await emailFailed(j),
      contactOptedOut: optedOut,
      ...(withUrl ? { trackUrl: trackUrl(deps.env, j.id) } : {}),
    };
  }

  async function own(userId: string, id: string): Promise<Row> {
    const j = await prisma.journey.findFirst({ where: { id, userId }, include });
    if (!j) throw errors.notFound("We couldn't find that journey.");
    return j;
  }

  /** Best effort for emails that are not safety-critical: log and carry on. */
  async function bestEffortContactEmail(
    j: Row,
    kind: "start" | "all-clear" | "escalation",
    userFullName: string | null,
  ) {
    const c = await prisma.emergencyContact.findUnique({ where: { id: j.emergencyContactId ?? "" } });
    if (!c || c.unsubscribedAt) return;
    try {
      await queueContactEmail(deps.email, deps.env, {
        to: c.email,
        kind,
        contactName: c.name,
        userFullName,
        destination: j.destinationText,
        eta: j.expectedArrivalAt,
        journeyId: j.id,
      });
    } catch (err) {
      deps.log.error({ err, journeyId: j.id }, `could not queue the ${kind} email`);
    }
  }

  return {
    async start(userId: string, input: StartJourney): Promise<JourneyDto> {
      const eta = new Date(input.expectedArrivalAt);
      const t = now().getTime();
      if (eta.getTime() < t + MIN_ETA_MINUTES * MIN_MS) {
        throw errors.validation([
          { field: "expectedArrivalAt", message: "Pick an arrival time at least 5 minutes from now." },
        ]);
      }
      if (eta.getTime() > t + MAX_ETA_HOURS * HOUR_MS) {
        throw errors.validation([{ field: "expectedArrivalAt", message: "Pick an arrival time within 24 hours." }]);
      }
      const contact = await prisma.emergencyContact.findFirst({ where: { id: input.emergencyContactId, userId } });
      if (!contact) throw errors.notFound("We couldn't find that trusted contact.");
      if (contact.unsubscribedAt) {
        throw errors.conflict(`${contact.name} asked to stop getting emails. Choose another contact.`);
      }
      const id = randomUUID();
      const token = deriveTrackToken(deps.env.SESSION_SECRET, id);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.journey.create({
            data: {
              id,
              userId,
              emergencyContactId: contact.id,
              destinationText: input.destinationText,
              destLat: input.destLat ?? null,
              destLng: input.destLng ?? null,
              startText: input.startText ?? null,
              startLat: input.startLat ?? null,
              startLng: input.startLng ?? null,
              trackingEnabled: input.trackingEnabled ?? false,
              ...(input.routeGeometry ? { routeGeometry: input.routeGeometry } : {}),
              ...(input.startLat !== undefined && input.startLng !== undefined && input.trackingEnabled
                ? { lastLat: input.startLat, lastLng: input.startLng, lastLocationAt: now() }
                : {}),
              notes: input.notes ?? null,
              startedAt: now(),
              expectedArrivalAt: eta,
              escalationMinutes: ESCALATION_MINUTES_DEFAULT,
              trackTokenHash: hashTrackToken(token),
              trackTokenExpiresAt: new Date(eta.getTime() + 24 * HOUR_MS),
            },
          });
          await tx.journeyEvent.create({ data: { journeyId: id, type: "STARTED", meta: {} } });
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw errors.conflict("You already have a journey in progress. Finish or cancel it first.");
        }
        throw err;
      }
      const j = await own(userId, id);
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      await bestEffortContactEmail(j, "start", u?.fullName ?? null);
      return toDto(j, true);
    },

    async active(userId: string): Promise<JourneyDto | null> {
      const j = await prisma.journey.findFirst({ where: { userId, status: { in: ["ACTIVE", "OVERDUE"] } }, include });
      return j ? toDto(j) : null;
    },

    async history(userId: string, q: { cursor?: string | undefined; limit: number }) {
      const rows = await prisma.journey.findMany({
        where: { userId, status: { in: ["COMPLETED", "CANCELLED"] }, ...afterCursor(decodeCursor(q.cursor)) },
        orderBy: cursorOrderBy,
        take: q.limit + 1,
        include,
      });
      const page = buildCursorPage(rows, q.limit, (r) => r);
      return { data: await Promise.all(page.data.map((r) => toDto(r))), meta: page.meta };
    },

    async detail(userId: string, id: string): Promise<JourneyDto> {
      return toDto(await own(userId, id));
    },

    /** Completing or cancelling ends the journey; if the contact was already alerted they get an all-clear. */
    async finish(userId: string, id: string, to: "COMPLETED" | "CANCELLED"): Promise<JourneyDto> {
      await own(userId, id);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM journeys WHERE id = ${id}::uuid FOR UPDATE`;
        const j = await tx.journey.findUnique({ where: { id } });
        if (!j || (j.status !== "ACTIVE" && j.status !== "OVERDUE"))
          throw errors.conflict("This journey has already ended.");
        await tx.journey.update({ where: { id }, data: { status: to, completedAt: now() } });
        await tx.journeyEvent.create({ data: { journeyId: id, type: to, meta: {} } });
      });
      const j = await own(userId, id);
      if (j.contactNotifiedAt) {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        await bestEffortContactEmail(j, "all-clear", u?.fullName ?? null);
      }
      return toDto(j);
    },

    async extend(userId: string, id: string, minutes: 15 | 30): Promise<JourneyDto> {
      await own(userId, id);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM journeys WHERE id = ${id}::uuid FOR UPDATE`;
        const j = await tx.journey.findUnique({ where: { id } });
        if (!j || (j.status !== "ACTIVE" && j.status !== "OVERDUE"))
          throw errors.conflict("This journey has already ended.");
        if (j.contactNotifiedAt)
          throw errors.conflict("Your contact was already emailed. Mark the journey as finished instead.");
        if (j.extensionsUsed >= MAX_EXTENSIONS) throw errors.conflict("You can extend a journey twice.");
        // Extend from the later of the current ETA and now, so an extension always lands in the future.
        const base = Math.max(j.expectedArrivalAt.getTime(), now().getTime());
        const eta = new Date(base + minutes * MIN_MS);
        await tx.journey.update({
          where: { id },
          data: {
            expectedArrivalAt: eta,
            extensionsUsed: { increment: 1 },
            status: "ACTIVE",
            overdueAt: null,
            trackTokenExpiresAt: new Date(eta.getTime() + 24 * HOUR_MS),
          },
        });
        await tx.journeyEvent.create({ data: { journeyId: id, type: "EXTENDED", meta: { minutes } } });
      });
      return toDto(await own(userId, id));
    },

    /** Public view for a trusted contact. Any problem is the same neutral 404. */
    async track(token: string): Promise<TrackDto> {
      const j = await prisma.journey.findUnique({
        where: { trackTokenHash: hashTrackToken(token) },
        include: { user: { select: { fullName: true } } },
      });
      if (!j || j.trackTokenExpiresAt.getTime() < now().getTime()) throw errors.notFound("This link isn't available.");
      return {
        firstName: firstNameOf(j.user.fullName),
        destinationText: j.destinationText,
        expectedArrivalAt: j.expectedArrivalAt.toISOString(),
        status:
          j.status === "ACTIVE"
            ? "ON_THE_WAY"
            : j.status === "OVERDUE"
              ? "RUNNING_LATE"
              : j.status === "COMPLETED"
                ? "ARRIVED"
                : "ENDED",
        trackingEnabled: j.trackingEnabled,
        safetyState: (j.safetyState as JourneySafetyState) ?? "NORMAL",
        lastLat: j.trackingEnabled && j.lastLat !== null ? Number(j.lastLat) : null,
        lastLng: j.trackingEnabled && j.lastLng !== null ? Number(j.lastLng) : null,
        lastLocationAt: j.trackingEnabled ? (j.lastLocationAt?.toISOString() ?? null) : null,
      };
    },

    async recordLocation(userId: string, id: string, input: LocationUpdateInput): Promise<JourneyDto> {
      const existing = await own(userId, id);
      if (existing.status !== "ACTIVE" && existing.status !== "OVERDUE") {
        throw errors.conflict("This journey has already ended.");
      }
      if (!existing.trackingEnabled) {
        throw errors.conflict("Live tracking is not enabled for this journey.");
      }

      const recordedAt = input.recordedAt ? new Date(input.recordedAt) : now();
      let notifyCondition: "deviated" | "stopped" | null = null;

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM journeys WHERE id = ${id}::uuid FOR UPDATE`;
        const j = await tx.journey.findUnique({ where: { id } });
        if (!j || (j.status !== "ACTIVE" && j.status !== "OVERDUE")) return;

        await tx.journeyLocation.create({
          data: {
            journeyId: id,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyM: input.accuracyM ?? null,
            speedMps: input.speedMps ?? null,
            recordedAt,
          },
        });

        let nextSafetyState = j.safetyState;

        // 1. Route deviation check (> 250 m from planned route polyline)
        const geom = (j.routeGeometry as Array<[number, number]> | null) ?? null;
        if (geom && geom.length >= 2) {
          const distM = distanceToPolylineM(input.latitude, input.longitude, geom);
          if (distM > 250) {
            const already = await tx.journeyEvent.findFirst({ where: { journeyId: id, type: "DEVIATED" } });
            if (!already) {
              await tx.journeyEvent.create({
                data: { journeyId: id, type: "DEVIATED", meta: { distanceM: Math.round(distM) } },
              });
              if (nextSafetyState !== "SOS") nextSafetyState = "DEVIATED";
              notifyCondition = "deviated";
            }
          }
        }

        // 2. Prolonged unexpected stoppage (>= 5 min within 30 m)
        const fiveMinAgo = new Date(recordedAt.getTime() - 5 * MIN_MS);
        const recent = await tx.journeyLocation.findMany({
          where: { journeyId: id, recordedAt: { gte: new Date(recordedAt.getTime() - 10 * MIN_MS) } },
          orderBy: { recordedAt: "asc" },
          take: 50,
        });
        const oldest = recent[0];
        if (oldest && oldest.recordedAt.getTime() <= fiveMinAgo.getTime()) {
          const maxMoveM = Math.max(
            ...recent.map(
              (p) =>
                haversineKm(
                  { lat: input.latitude, lng: input.longitude },
                  { lat: Number(p.latitude), lng: Number(p.longitude) },
                ) * 1000,
            ),
          );
          if (maxMoveM <= 30) {
            const already = await tx.journeyEvent.findFirst({ where: { journeyId: id, type: "STOPPED" } });
            if (!already) {
              await tx.journeyEvent.create({
                data: { journeyId: id, type: "STOPPED", meta: { maxMoveM: Math.round(maxMoveM) } },
              });
              if (nextSafetyState === "NORMAL") nextSafetyState = "STOPPED";
              if (!notifyCondition) notifyCondition = "stopped";
            }
          }
        }

        await tx.journey.update({
          where: { id },
          data: {
            lastLat: input.latitude,
            lastLng: input.longitude,
            lastLocationAt: recordedAt,
            safetyState: nextSafetyState,
          },
        });
      });

      const updated = await own(userId, id);
      if (notifyCondition) {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        await bestEffortContactEmail(updated, "escalation", u?.fullName ?? null);
      }
      return toDto(updated);
    },

    async triggerSos(
      userId: string,
      id: string,
    ): Promise<{ ok: true; emergencyNumber: "112"; journey: JourneyDto }> {
      await own(userId, id);
      let shouldNotify = false;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM journeys WHERE id = ${id}::uuid FOR UPDATE`;
        const j = await tx.journey.findUnique({ where: { id } });
        if (!j || (j.status !== "ACTIVE" && j.status !== "OVERDUE")) {
          throw errors.conflict("This journey has already ended.");
        }
        const already = await tx.journeyEvent.findFirst({ where: { journeyId: id, type: "SOS_TRIGGERED" } });
        if (!already) {
          await tx.journeyEvent.create({
            data: {
              journeyId: id,
              type: "SOS_TRIGGERED",
              meta: {
                lastLat: j.lastLat !== null ? Number(j.lastLat) : null,
                lastLng: j.lastLng !== null ? Number(j.lastLng) : null,
              },
            },
          });
          shouldNotify = true;
        }
        await tx.journey.update({
          where: { id },
          data: {
            safetyState: "SOS",
            sosTriggeredAt: j.sosTriggeredAt ?? now(),
          },
        });
      });

      const updated = await own(userId, id);
      if (shouldNotify) {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        await bestEffortContactEmail(updated, "escalation", u?.fullName ?? null);
      }
      return { ok: true, emergencyNumber: "112", journey: await toDto(updated) };
    },

    async unsubscribe(token: string): Promise<{ ok: true }> {
      const j = await prisma.journey.findUnique({ where: { trackTokenHash: hashTrackToken(token) } });
      if (!j || !j.emergencyContactId || j.trackTokenExpiresAt.getTime() < now().getTime()) {
        throw errors.notFound("This link isn't available.");
      }
      await prisma.emergencyContact.updateMany({
        where: { id: j.emergencyContactId, unsubscribedAt: null },
        data: { unsubscribedAt: now() },
      });
      return { ok: true };
    },
  };
}

export type JourneysService = ReturnType<typeof createJourneysService>;
