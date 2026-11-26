// ride.lifecycle (every 5 min): auto-start 15 min after departure, auto-complete after 3 h,
// expire pending requests of rides that are gone or started. Idempotent: it only moves rows forward.
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";

const MIN_MS = 60_000;

export async function runRideLifecycle(prisma: PrismaClient, clock: Clock) {
  const t = clock.now();
  const startCutoff = new Date(t.getTime() - 15 * MIN_MS);
  const doneCutoff = new Date(t.getTime() - 3 * 60 * MIN_MS);
  const started = await prisma.ride.updateMany({
    where: { status: { in: ["OPEN", "FULL"] }, departureAt: { lte: startCutoff } },
    data: { status: "IN_PROGRESS", version: { increment: 1 } },
  });
  const completed = await prisma.ride.updateMany({
    where: { status: "IN_PROGRESS", departureAt: { lte: doneCutoff } },
    data: { status: "COMPLETED", version: { increment: 1 } },
  });
  const expired = await prisma.rideRequest.updateMany({
    where: {
      status: "PENDING",
      ride: { OR: [{ departureAt: { lte: t } }, { status: { in: ["IN_PROGRESS", "COMPLETED", "CANCELLED"] } }] },
    },
    data: { status: "EXPIRED", decidedAt: t },
  });
  return { started: started.count, completed: completed.count, expired: expired.count };
}
