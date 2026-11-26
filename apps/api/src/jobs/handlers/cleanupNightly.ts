// Nightly retention & suspension-expiry cleanup (Part B3, appendix-06 6.5).
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { JOB_NAMES, defineJob } from "../registry.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface CleanupCounts {
  restoredUsers: number;
  scrubbedUsers: number;
  otpCodes: number;
  sessions: number;
  notifications: number;
  idempotencyKeys: number;
  orphanedUploads: number;
  deletedUploads: number;
  journeys: number;
  rideMessages: number;
  alerts: number;
}

export async function runNightlyCleanup(prisma: PrismaClient, clock: Clock): Promise<CleanupCounts> {
  const now = clock.now();
  const ago = (ms: number) => new Date(now.getTime() - ms);

  // 1. Auto-restore users whose temporary suspension has expired (M5/M6).
  const suspended = await prisma.user.findMany({
    where: { status: "SUSPENDED" },
    select: { id: true, prefs: true },
  });
  let restoredUsers = 0;
  for (const u of suspended) {
    const prefs = ((u.prefs as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const untilRaw = typeof prefs.suspendedUntil === "string" ? Date.parse(prefs.suspendedUntil) : Number.NaN;
    if (!Number.isFinite(untilRaw) || untilRaw > now.getTime()) continue;
    const { suspendedUntil: _drop, ...rest } = prefs;
    void _drop;
    await prisma.user.update({
      where: { id: u.id },
      data: { status: "ACTIVE", prefs: rest as object },
    });
    restoredUsers++;
  }

  // 2. Scrub PII for soft-deleted accounts past the 30-day grace period (appendix-06 6.5).
  const scrubCandidates = await prisma.user.findMany({
    where: {
      status: "DELETED",
      deletedAt: { lte: ago(30 * DAY_MS) },
      OR: [{ fullName: { not: null } }, { phone: { not: null } }, { avatarUrl: { not: null } }],
    },
    select: { id: true },
  });
  let scrubbedUsers = 0;
  for (const u of scrubCandidates) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        email: `deleted-${u.id}@deleted.invalid`,
        fullName: null,
        phone: null,
        avatarUrl: null,
        prefs: {},
      },
    });
    scrubbedUsers++;
  }

  // 3. Retention deletions (appendix-06 6.5 + Part B4).
  const otpCodes = (await prisma.otpCode.deleteMany({ where: { expiresAt: { lte: ago(24 * HOUR_MS) } } })).count;

  const sessions = (
    await prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: ago(30 * DAY_MS) } }, { revokedAt: { lte: ago(30 * DAY_MS) } }],
      },
    })
  ).count;

  const notifications = (await prisma.notification.deleteMany({ where: { createdAt: { lte: ago(60 * DAY_MS) } } }))
    .count;

  const idempotencyKeys = (await prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lte: now } } })).count;

  const orphanedUploads = (
    await prisma.upload.updateMany({
      where: { status: "PENDING", createdAt: { lte: ago(24 * HOUR_MS) } },
      data: { status: "ORPHANED" },
    })
  ).count;

  const deletedUploads = (
    await prisma.upload.deleteMany({
      where: { status: "ORPHANED", updatedAt: { lte: ago(7 * DAY_MS) } },
    })
  ).count;

  const journeys = (
    await prisma.journey.deleteMany({
      where: {
        status: { in: ["COMPLETED", "CANCELLED"] },
        OR: [{ completedAt: { lte: ago(90 * DAY_MS) } }, { completedAt: null, updatedAt: { lte: ago(90 * DAY_MS) } }],
      },
    })
  ).count;

  const rideMessages = (
    await prisma.rideMessage.deleteMany({
      where: {
        ride: {
          status: { in: ["COMPLETED", "CANCELLED"] },
          updatedAt: { lte: ago(30 * DAY_MS) },
        },
      },
    })
  ).count;

  const alerts = (await prisma.alert.deleteMany({ where: { createdAt: { lte: ago(365 * DAY_MS) } } })).count;

  return {
    restoredUsers,
    scrubbedUsers,
    otpCodes,
    sessions,
    notifications,
    idempotencyKeys,
    orphanedUploads,
    deletedUploads,
    journeys,
    rideMessages,
    alerts,
  };
}

export const cleanupNightlyJob = defineJob({
  name: JOB_NAMES.cleanupNightly,
  schedule: { cron: "0 2 * * *", tz: "Asia/Kolkata" },
  retryLimit: 2,
  retryDelaySeconds: 30,
  retryDelayMaxSeconds: 300,
  expireInSeconds: 300,
  handler: async (_data, ctx) => {
    const counts = await runNightlyCleanup(ctx.prisma, ctx.clock);
    ctx.log.info(counts, "nightly cleanup complete");
  },
});
