// One query set per dashboard card (appendix-04 S5, A5.2). Every query is scoped to the signed-in user;
// nothing here accepts a user id from the client.
import { bboxAround, haversineKm, type LatLng } from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { SettingsService } from "../settings/settings.service.js";

const CATEGORY_LABEL: Record<string, string> = {
  ROAD_ACCIDENT: "Road accident",
  MEDICAL: "Medical emergency",
  HARASSMENT: "Harassment",
  FIRE: "Fire",
  PUBLIC_HAZARD: "Public hazard",
  OTHER: "Other alert",
};

const num = (d: { toString(): string } | number) => Number(d);

export function createDashboardService(deps: { prisma: PrismaClient; clock: Clock; settings: SettingsService }) {
  const { prisma, clock } = deps;

  /** The user's saved alert area, if they have set one (appendix-02 2D). */
  async function alertArea(userId: string): Promise<{ center: LatLng; radiusKm: number } | null> {
    const s = await prisma.alertSubscription.findUnique({ where: { userId } });
    if (!s || !s.enabled || s.centerLat === null || s.centerLng === null) return null;
    return { center: { lat: num(s.centerLat), lng: num(s.centerLng) }, radiusKm: s.radiusKm };
  }

  return {
    async setup(userId: string) {
      const [user, contacts, area] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } }),
        prisma.emergencyContact.count({ where: { userId } }),
        alertArea(userId),
      ]);
      return {
        firstName: (user.fullName ?? "").split(/\s+/)[0] || null,
        contactCount: contacts,
        alertArea: area ? { radiusKm: area.radiusKm } : null,
      };
    },

    async journey(userId: string) {
      const now = clock.now();
      const j = await prisma.journey.findFirst({
        where: { userId, status: { in: ["ACTIVE", "OVERDUE"] } },
        include: { emergencyContact: { select: { name: true } } },
      });
      if (!j) return null;
      const total = j.expectedArrivalAt.getTime() - j.startedAt.getTime();
      const elapsed = now.getTime() - j.startedAt.getTime();
      return {
        id: j.id,
        status: j.status,
        startText: j.startText,
        destinationText: j.destinationText,
        expectedArrivalAt: j.expectedArrivalAt.toISOString(),
        minutesLeft: Math.max(0, Math.ceil((j.expectedArrivalAt.getTime() - now.getTime()) / 60_000)),
        progressPct: total > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : 100,
        contactName: j.emergencyContact?.name ?? null,
        contactNotified: j.contactNotifiedAt !== null,
      };
    },

    async alerts(userId: string) {
      const area = await alertArea(userId);
      if (!area) return { hasArea: false, items: [] as never[] };
      const now = clock.now();
      const box = bboxAround(area.center, area.radiusKm);
      const rows = await prisma.alert.findMany({
        where: {
          status: { in: ["ACTIVE", "VERIFIED"] },
          expiresAt: { gt: now },
          needsReviewFirst: false,
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLng, lte: box.maxLng },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const items = rows
        .map((a) => ({ a, km: haversineKm(area.center, { lat: num(a.latitude), lng: num(a.longitude) }) }))
        .filter((x) => x.km <= area.radiusKm)
        .slice(0, 3)
        .map(({ a, km }) => ({
          id: a.id,
          title: CATEGORY_LABEL[a.category] ?? "Alert",
          addressText: a.addressText,
          distanceKm: Math.round(km * 10) / 10,
          minutesAgo: Math.max(0, Math.round((now.getTime() - a.createdAt.getTime()) / 60_000)),
          status: a.status,
        }));
      return { hasArea: true, items };
    },

    async rides(userId: string) {
      const now = clock.now();
      const ride = await prisma.ride.findFirst({
        where: {
          departureAt: { gt: now },
          status: { in: ["OPEN", "FULL"] },
          OR: [{ creatorId: userId }, { participants: { some: { userId, leftAt: null } } }],
        },
        orderBy: { departureAt: "asc" },
        include: { participants: { where: { leftAt: null }, select: { userId: true } } },
      });
      if (!ride) return null;
      const riders = ride.participants.length;
      return {
        id: ride.id,
        sourceText: ride.sourceText,
        destText: ride.destText,
        departureAt: ride.departureAt.toISOString(),
        // The viewer plus everyone else on the ride (creator included).
        othersCount: riders,
        perPersonFare: Math.round(ride.estimatedTotalFare / (riders + 1)),
        isCreator: ride.creatorId === userId,
      };
    },

    async reports(userId: string) {
      const now = clock.now();
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
      const [rows, thisWeek] = await Promise.all([
        prisma.report.findMany({
          where: { authorId: userId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, title: true, status: true, category: true, createdAt: true },
        }),
        prisma.report.count({ where: { authorId: userId, deletedAt: null, createdAt: { gte: weekAgo } } }),
      ]);
      return {
        thisWeek,
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          category: r.category,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },

    /** Community counts for the user's area (alert area if set, else the service region). Not shown in v1 (DECISIONS #22). */
    async snapshot(userId: string) {
      const now = clock.now();
      const area = await alertArea(userId);
      const region = await deps.settings.get("serviceRegion");
      const box = area ? bboxAround(area.center, area.radiusKm) : region;
      const within = { gte: box.minLat, lte: box.maxLat };
      const withinLng = { gte: box.minLng, lte: box.maxLng };
      const [reports, alerts, rides] = await Promise.all([
        prisma.report.count({
          where: {
            deletedAt: null,
            status: { notIn: ["RESOLVED", "REJECTED"] },
            latitude: within,
            longitude: withinLng,
          },
        }),
        prisma.alert.count({
          where: {
            status: { in: ["ACTIVE", "VERIFIED"] },
            expiresAt: { gt: now },
            latitude: within,
            longitude: withinLng,
          },
        }),
        prisma.ride.count({
          where: { status: "OPEN", departureAt: { gt: now }, sourceLat: within, sourceLng: withinLng },
        }),
      ]);
      return {
        scope: area ? "alert-area" : "service-region",
        activeReports: reports,
        activeAlerts: alerts,
        openRides: rides,
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
