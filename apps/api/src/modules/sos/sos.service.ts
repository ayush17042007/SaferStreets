import { haversineKm, type SosEventDto, type TriggerSosInput } from "@saferstreets/shared";
import { randomUUID } from "node:crypto";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { NotificationService } from "../notifications/notifications.service.js";

const PUSH_NOTE =
  "In-app and email notifications queued for opted-in nearby users. Native device push notifications are not configured in this build.";

function toDto(row: {
  id: string;
  status: "ACTIVE" | "RESOLVED" | "CANCELLED";
  latitude: unknown;
  longitude: unknown;
  radiusKm: number;
  notifiedCount: number;
  createdAt: Date;
  resolvedAt: Date | null;
}): SosEventDto {
  return {
    id: row.id,
    status: row.status,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusKm: row.radiusKm,
    notifiedCount: row.notifiedCount,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    deliveryChannel: "in_app_and_email",
    pushNote: PUSH_NOTE,
  };
}

export function createSosService(deps: {
  prisma: PrismaClient;
  clock: Clock;
  notifications: NotificationService;
}) {
  const { prisma, clock, notifications } = deps;

  return {
    async trigger(userId: string, input: TriggerSosInput): Promise<SosEventDto> {
      const now = clock.now();
      const radiusKm = input.radiusKm ?? 3;
      const latPad = radiusKm / 110.574;
      const lngPad = radiusKm / (111.32 * Math.max(0.2, Math.cos((input.latitude * Math.PI) / 180)));

      const id = randomUUID();
      const flushes: Array<() => Promise<void>> = [];
      let notifiedCount = 0;

      const created = await prisma.$transaction(async (tx) => {
        // Resolve any stale active SOS by the same user before opening a fresh one.
        await tx.sosEvent.updateMany({
          where: { userId, status: "ACTIVE" },
          data: { status: "RESOLVED", resolvedAt: now },
        });

        const candidates = await tx.alertSubscription.findMany({
          where: {
            enabled: true,
            sosNearbyOptIn: true,
            userId: { not: userId },
            centerLat: { gte: input.latitude - latPad, lte: input.latitude + latPad },
            centerLng: { gte: input.longitude - lngPad, lte: input.longitude + lngPad },
            user: { status: "ACTIVE", deletedAt: null },
          },
          select: { userId: true, centerLat: true, centerLng: true, radiusKm: true, emailEnabled: true },
          take: 200,
        });

        const seen = new Set<string>();
        const mapUrl = `https://www.openstreetmap.org/?mlat=${input.latitude}&mlon=${input.longitude}#map=16/${input.latitude}/${input.longitude}`;
        const tsLabel = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

        for (const c of candidates) {
          if (seen.has(c.userId) || c.centerLat === null || c.centerLng === null) continue;
          const distKm = haversineKm(
            { lat: input.latitude, lng: input.longitude },
            { lat: Number(c.centerLat), lng: Number(c.centerLng) },
          );
          if (distKm > Math.max(radiusKm, c.radiusKm)) continue;
          seen.add(c.userId);

          const { flush } = await notifications.create(tx, {
            userId: c.userId,
            type: "ALERT_NEARBY",
            module: "safealert",
            title: "Nearby SOS alert",
            body: `An SOS was triggered ${distKm.toFixed(1)} km from your alert area at ${tsLabel} IST (${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}). Map: ${mapUrl}`,
            link: "/safealert",
            data: {
              sosEventId: id,
              latitude: input.latitude,
              longitude: input.longitude,
              mapUrl,
              triggeredAt: now.toISOString(),
            },
            email: c.emailEnabled,
          });
          flushes.push(flush);
        }

        notifiedCount = seen.size;
        return tx.sosEvent.create({
          data: {
            id,
            userId,
            latitude: input.latitude,
            longitude: input.longitude,
            radiusKm,
            status: "ACTIVE",
            notifiedCount,
          },
        });
      });

      await Promise.allSettled(flushes.map((fn) => fn()));
      return toDto(created);
    },

    async active(userId: string): Promise<SosEventDto | null> {
      const row = await prisma.sosEvent.findFirst({
        where: { userId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      return row ? toDto(row) : null;
    },

    async resolve(userId: string, id: string): Promise<SosEventDto> {
      const existing = await prisma.sosEvent.findFirst({ where: { id, userId } });
      if (!existing) throw errors.notFound("We couldn't find that SOS event.");
      if (existing.status !== "ACTIVE") return toDto(existing);
      const updated = await prisma.sosEvent.update({
        where: { id },
        data: { status: "RESOLVED", resolvedAt: clock.now() },
      });
      return toDto(updated);
    },
  };
}

export type SosService = ReturnType<typeof createSosService>;
