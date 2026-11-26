// alert.fanout and alert.expire jobs (appendix-02 2D). Fan-out is idempotent: a user who already has a
// notification for the alert is skipped, so a retried job never double-notifies. Always "Unverified" + 112.
import { ALERT_MAX_RADIUS_KM, bboxAround, haversineKm } from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { NotificationService } from "../notifications/notifications.service.js";

export const ALERT_LABEL: Record<string, string> = {
  ROAD_ACCIDENT: "Road accident",
  MEDICAL: "Medical emergency",
  HARASSMENT: "Harassment",
  FIRE: "Fire",
  PUBLIC_HAZARD: "Public hazard",
  OTHER: "Other",
};

export const FANOUT_BATCH = 200;

export async function runAlertFanout(deps: {
  prisma: PrismaClient;
  clock: Clock;
  notifications: NotificationService;
  alertId: string;
}): Promise<{ notified: number }> {
  const { prisma } = deps;
  const alert = await prisma.alert.findUnique({ where: { id: deps.alertId } });
  if (
    !alert ||
    alert.needsReviewFirst ||
    (alert.status !== "ACTIVE" && alert.status !== "VERIFIED") ||
    alert.expiresAt.getTime() <= deps.clock.now().getTime()
  ) {
    return { notified: 0 };
  }
  const here = { lat: Number(alert.latitude), lng: Number(alert.longitude) };
  const box = bboxAround(here, ALERT_MAX_RADIUS_KM);
  const label = ALERT_LABEL[alert.category] ?? "Alert";
  let after = "00000000-0000-0000-0000-000000000000";
  let notified = 0;

  for (;;) {
    const subs = await prisma.alertSubscription.findMany({
      where: {
        enabled: true,
        userId: { gt: after, not: alert.authorId },
        centerLat: { gte: box.minLat, lte: box.maxLat },
        centerLng: { gte: box.minLng, lte: box.maxLng },
        user: { status: "ACTIVE", deletedAt: null },
      },
      orderBy: { userId: "asc" },
      take: FANOUT_BATCH,
    });
    if (subs.length === 0) break;
    after = subs[subs.length - 1]!.userId;

    const ids = subs.map((s) => s.userId);
    const [blocks, already] = await Promise.all([
      prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: alert.authorId, blockedId: { in: ids } },
            { blockedId: alert.authorId, blockerId: { in: ids } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
      prisma.notification.findMany({
        where: { userId: { in: ids }, type: "ALERT_NEARBY", data: { path: ["alertId"], equals: alert.id } },
        select: { userId: true },
      }),
    ]);
    const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    const done = new Set(already.map((a) => a.userId));

    const targets = subs.filter((s) => {
      if (blocked.has(s.userId) || done.has(s.userId)) return false;
      if (s.categories.length > 0 && !s.categories.includes(alert.category)) return false;
      return haversineKm(here, { lat: Number(s.centerLat), lng: Number(s.centerLng) }) <= s.radiusKm;
    });

    const flushes: Array<() => Promise<void>> = [];
    await prisma.$transaction(async (tx) => {
      for (const s of targets) {
        const { flush } = await deps.notifications.create(tx, {
          userId: s.userId,
          type: "ALERT_NEARBY",
          module: "safealert",
          title: `Unverified alert near you: ${label.toLowerCase()}`,
          body: `Unverified report of ${label.toLowerCase()} near ${alert.addressText}. It has not been checked. If anyone is in danger, call 112. SaferStreets does not contact emergency services.`,
          link: `/safealert/${alert.id}`,
          data: { alertId: alert.id },
          email: s.emailEnabled,
        });
        flushes.push(flush);
      }
    });
    for (const f of flushes) await f().catch(() => undefined); // one bad address must not stop the batch
    notified += targets.length;
    if (subs.length < FANOUT_BATCH) break;
  }
  return { notified };
}

/** alert.expire: ACTIVE and VERIFIED alerts past their expiry become EXPIRED. Idempotent. */
export async function runAlertExpire(prisma: PrismaClient, clock: Clock): Promise<number> {
  const r = await prisma.alert.updateMany({
    where: { status: { in: ["ACTIVE", "VERIFIED"] }, expiresAt: { lte: clock.now() } },
    data: { status: "EXPIRED" },
  });
  return r.count;
}
