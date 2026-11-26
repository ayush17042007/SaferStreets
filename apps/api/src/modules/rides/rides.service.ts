// AutoMate rides (appendix-02 2B). Business rules live here; routes only validate and respond.
import {
  MAX_LEAD_DAYS,
  MAX_OPEN_RIDES,
  MIN_LEAD_MINUTES,
  MIN_ROUTE_METERS,
  OVERLAP_WINDOW_MINUTES,
  bboxAround,
  haversineKm,
  haversineMeters,
  type CreateRide,
  type EditRide,
  type ListRidesQuery,
  type RideCardDto,
  type RideDetailDto,
  type RideMemberDto,
  type RideRequestDto,
} from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor } from "../../lib/pagination.js";
import { type Prisma, type PrismaClient } from "../../lib/prisma.js";
import type { NotificationService } from "../notifications/notifications.service.js";

export interface RideViewer {
  userId?: string | undefined;
}

const MIN_MS = 60_000;
const SEARCH_RADIUS_KM = 3;
const IST_OFFSET_MS = 330 * MIN_MS;

type RideRow = Prisma.RideGetPayload<{
  include: {
    creator: { select: { id: true; fullName: true; avatarUrl: true } };
    participants: { include: { user: { select: { id: true; fullName: true; avatarUrl: true; phone: true } } } };
  };
}>;

const num = (d: { toString(): string } | number) => Number(d);
const nameOf = (n: string | null) => n ?? "Member";
/** Per-person split: the host counts as a payer. Computed on the server only. */
export const perPersonFare = (total: number, accepted: number) => Math.ceil(total / (accepted + 1));

export function createRidesService(deps: { prisma: PrismaClient; clock: Clock; notifications: NotificationService }) {
  const { prisma, clock } = deps;
  const now = () => clock.now();

  async function blockedIds(userId: string | undefined): Promise<string[]> {
    if (!userId) return [];
    const rows = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  async function completedCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.ride.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: ids }, status: "COMPLETED" },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.creatorId, r._count._all]));
  }

  const activeRiders = (r: RideRow) => r.participants.filter((p) => p.leftAt === null);

  async function myRequestStatus(rideId: string, userId: string | undefined) {
    if (!userId) return null;
    const q = await prisma.rideRequest.findUnique({ where: { rideId_userId: { rideId, userId } } });
    return q?.status ?? null;
  }

  function card(r: RideRow, v: RideViewer, completed: number, myRequest: RideCardDto["myRequest"]): RideCardDto {
    const riders = activeRiders(r);
    return {
      id: r.id,
      sourceText: r.sourceText,
      destText: r.destText,
      departureAt: r.departureAt.toISOString(),
      status: r.status,
      seatsTotal: r.seatsTotal,
      seatsLeft: Math.max(0, r.seatsTotal - r.seatsTaken),
      estimatedTotalFare: r.estimatedTotalFare,
      perPersonFare: perPersonFare(r.estimatedTotalFare, r.seatsTaken),
      host: v.userId
        ? {
            id: r.creator.id,
            displayName: nameOf(r.creator.fullName),
            avatarUrl: r.creator.avatarUrl,
            completedRides: completed,
          }
        : null,
      isMine: v.userId === r.creatorId,
      myRequest,
      joined: v.userId !== undefined && riders.some((p) => p.userId === v.userId),
    };
  }

  const includeAll = {
    creator: { select: { id: true, fullName: true, avatarUrl: true } },
    participants: { include: { user: { select: { id: true, fullName: true, avatarUrl: true, phone: true } } } },
  } as const;

  async function loadVisible(id: string, v: RideViewer): Promise<RideRow> {
    const r = await prisma.ride.findUnique({ where: { id }, include: includeAll });
    if (!r) throw errors.notFound("We couldn't find that ride.");
    const blocked = await blockedIds(v.userId);
    const related =
      v.userId !== undefined &&
      (r.creatorId === v.userId ||
        r.participants.some((p) => p.userId === v.userId) ||
        (await prisma.rideRequest.count({ where: { rideId: id, userId: v.userId } })) > 0);
    if (!related && (r.status === "CANCELLED" || blocked.includes(r.creatorId))) {
      throw errors.notFound("We couldn't find that ride.");
    }
    return r;
  }

  async function detail(id: string, v: RideViewer): Promise<RideDetailDto> {
    const r = await loadVisible(id, v);
    const completed = (await completedCounts([r.creatorId])).get(r.creatorId) ?? 0;
    const mine = v.userId === r.creatorId;
    const mineReq = await myRequestStatus(id, v.userId);
    const base = card(r, v, completed, mineReq);
    const riders = activeRiders(r);
    const isMember = mine || base.joined;
    const members: RideMemberDto[] = isMember
      ? [
          {
            userId: r.creator.id,
            displayName: nameOf(r.creator.fullName),
            avatarUrl: r.creator.avatarUrl,
            phone:
              (await prisma.user.findUnique({ where: { id: r.creatorId }, select: { phone: true } }))?.phone ?? null,
            role: "host" as const,
          },
          ...riders.map((p) => ({
            userId: p.user.id,
            displayName: nameOf(p.user.fullName),
            avatarUrl: p.user.avatarUrl,
            phone: p.user.phone,
            role: "rider" as const,
          })),
        ]
      : [];
    const pending = mine ? await prisma.rideRequest.count({ where: { rideId: id, status: "PENDING" } }) : 0;
    const open = r.status === "OPEN" && r.departureAt.getTime() > now().getTime();
    return {
      ...base,
      sourceLat: num(r.sourceLat),
      sourceLng: num(r.sourceLng),
      destLat: num(r.destLat),
      destLng: num(r.destLng),
      note: r.note,
      cancelReason: r.cancelReason,
      version: r.version,
      members,
      pendingRequests: pending,
      canEdit: mine && r.status === "OPEN" && r.seatsTaken === 0,
      canRequest: Boolean(v.userId) && !mine && open && (mineReq === null || mineReq === "CANCELLED"),
    };
  }

  function checkDeparture(departureAt: Date) {
    const t = now().getTime();
    const d = departureAt.getTime();
    if (d < t + MIN_LEAD_MINUTES * MIN_MS) {
      throw errors.validation([{ field: "departureAt", message: "Pick a time at least 15 minutes from now." }]);
    }
    if (d > t + MAX_LEAD_DAYS * 24 * 60 * MIN_MS) {
      throw errors.validation([{ field: "departureAt", message: "Pick a time within the next 14 days." }]);
    }
  }

  /** Locks the ride row for the rest of the transaction and returns it. */
  async function lockRide(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM rides WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.ride.findUnique({ where: { id } });
    if (!r) throw errors.notFound("We couldn't find that ride.");
    return r;
  }

  async function notifyMany(
    tx: Prisma.TransactionClient,
    items: {
      userId: string;
      type: "RIDE_REQUEST" | "RIDE_DECISION" | "RIDE_UPDATE";
      title: string;
      body: string;
      link: string;
    }[],
  ) {
    const flushes: (() => Promise<void>)[] = [];
    for (const i of items) {
      const { flush } = await deps.notifications.create(tx, { ...i, module: "automate" });
      flushes.push(flush);
    }
    return async () => {
      for (const f of flushes) await f();
    };
  }

  async function creatorOnly(rideId: string, userId: string) {
    const r = await prisma.ride.findFirst({ where: { id: rideId, creatorId: userId } });
    if (!r) throw errors.notFound("We couldn't find that ride.");
    return r;
  }

  return {
    detail,

    async create(userId: string, input: CreateRide): Promise<RideDetailDto> {
      if (
        haversineMeters(
          { lat: input.source.lat, lng: input.source.lng },
          { lat: input.destination.lat, lng: input.destination.lng },
        ) < MIN_ROUTE_METERS
      ) {
        throw errors.validation([
          { field: "destination", message: "Pick a destination at least 300 m from the start." },
        ]);
      }
      const departureAt = new Date(input.departureAt);
      checkDeparture(departureAt);
      const id = await prisma.$transaction(async (tx) => {
        // Serialise creators so two parallel requests cannot both pass the open-rides cap.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const open = await tx.ride.count({ where: { creatorId: userId, status: { in: ["OPEN", "FULL"] } } });
        if (open >= MAX_OPEN_RIDES) throw errors.conflict("You already have 3 open rides. Cancel or finish one first.");
        const ride = await tx.ride.create({
          data: {
            creatorId: userId,
            sourceText: input.source.text,
            sourceLat: input.source.lat,
            sourceLng: input.source.lng,
            destText: input.destination.text,
            destLat: input.destination.lat,
            destLng: input.destination.lng,
            departureAt,
            seatsTotal: input.seatsTotal,
            estimatedTotalFare: input.estimatedTotalFare,
            note: input.note ?? null,
          },
        });
        return ride.id;
      });
      return detail(id, { userId });
    },

    async list(v: RideViewer, q: ListRidesQuery) {
      const blocked = await blockedIds(v.userId);
      const t = now();
      const where: Prisma.RideWhereInput[] = [
        { status: { in: ["OPEN", "FULL"] }, departureAt: { gt: t } },
        ...(blocked.length ? [{ creatorId: { notIn: blocked } }] : []),
      ];
      if (q.date) {
        const start = new Date(new Date(`${q.date}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
        where.push({ departureAt: { gte: start, lt: new Date(start.getTime() + 24 * 60 * MIN_MS) } });
      }
      const from = q.fromLat !== undefined && q.fromLng !== undefined ? { lat: q.fromLat, lng: q.fromLng } : null;
      const to = q.toLat !== undefined && q.toLng !== undefined ? { lat: q.toLat, lng: q.toLng } : null;
      if (from) {
        const b = bboxAround(from, SEARCH_RADIUS_KM);
        where.push({ sourceLat: { gte: b.minLat, lte: b.maxLat }, sourceLng: { gte: b.minLng, lte: b.maxLng } });
      }
      if (to) {
        const b = bboxAround(to, SEARCH_RADIUS_KM);
        where.push({ destLat: { gte: b.minLat, lte: b.maxLat }, destLng: { gte: b.minLng, lte: b.maxLng } });
      }
      let cursor = decodeCursor(q.cursor);
      const collected: RideRow[] = [];
      // Haversine and seat filters run after the bbox prefilter, so keep reading pages until the page is full.
      for (let guard = 0; guard < 10 && collected.length <= q.limit; guard++) {
        const rows = await prisma.ride.findMany({
          where: { AND: [...where, afterCursor(cursor)] },
          orderBy: cursorOrderBy,
          take: q.limit + 1,
          include: includeAll,
        });
        for (const r of rows) {
          const okFrom =
            !from || haversineKm(from, { lat: num(r.sourceLat), lng: num(r.sourceLng) }) <= SEARCH_RADIUS_KM;
          const okTo = !to || haversineKm(to, { lat: num(r.destLat), lng: num(r.destLng) }) <= SEARCH_RADIUS_KM;
          const okSeats = !q.seats || r.seatsTotal - r.seatsTaken >= q.seats;
          if (okFrom && okTo && okSeats) collected.push(r);
        }
        const more = rows.length > q.limit;
        const last = rows[rows.length - 1];
        if (!more || !last) break;
        cursor = { createdAt: last.createdAt, id: last.id };
      }
      const counts = await completedCounts([...new Set(collected.map((r) => r.creatorId))]);
      const mine = new Map<string, RideCardDto["myRequest"]>();
      if (v.userId) {
        const reqs = await prisma.rideRequest.findMany({
          where: { userId: v.userId, rideId: { in: collected.map((r) => r.id) } },
        });
        for (const r of reqs) mine.set(r.rideId, r.status);
      }
      const page = buildCursorPage(collected, q.limit, (r) =>
        card(r, v, counts.get(r.creatorId) ?? 0, mine.get(r.id) ?? null),
      );
      return page;
    },

    async edit(userId: string, rideId: string, input: EditRide): Promise<RideDetailDto> {
      await creatorOnly(rideId, userId);
      if (input.departureAt) checkDeparture(new Date(input.departureAt));
      await prisma.$transaction(async (tx) => {
        const r = await lockRide(tx, rideId);
        if (r.status !== "OPEN" || r.seatsTaken > 0) {
          throw errors.conflict("This ride can't be edited after someone joins.");
        }
        if (r.version !== input.version) throw errors.conflict();
        await tx.ride.update({
          where: { id: rideId },
          data: {
            ...(input.departureAt ? { departureAt: new Date(input.departureAt) } : {}),
            ...(input.seatsTotal !== undefined ? { seatsTotal: input.seatsTotal } : {}),
            ...(input.estimatedTotalFare !== undefined ? { estimatedTotalFare: input.estimatedTotalFare } : {}),
            ...(input.note !== undefined ? { note: input.note } : {}),
            version: { increment: 1 },
          },
        });
      });
      return detail(rideId, { userId });
    },

    async cancel(userId: string, rideId: string, reason: string): Promise<RideDetailDto> {
      await creatorOnly(rideId, userId);
      const flush = await prisma.$transaction(async (tx) => {
        const r = await lockRide(tx, rideId);
        if (r.status !== "OPEN" && r.status !== "FULL") throw errors.conflict("This ride can't be cancelled now.");
        await tx.ride.update({
          where: { id: rideId },
          data: { status: "CANCELLED", cancelReason: reason, version: { increment: 1 } },
        });
        const affected = await tx.rideRequest.findMany({
          where: { rideId, status: { in: ["PENDING", "ACCEPTED"] } },
          select: { userId: true },
        });
        await tx.rideRequest.updateMany({
          where: { rideId, status: { in: ["PENDING", "ACCEPTED"] } },
          data: { status: "CANCELLED", decidedAt: now() },
        });
        return notifyMany(
          tx,
          affected.map((a) => ({
            userId: a.userId,
            type: "RIDE_UPDATE" as const,
            title: "A ride was cancelled",
            body: `The ride from ${r.sourceText} to ${r.destText} was cancelled by the host. Reason: ${reason}`,
            link: `/automate/${rideId}`,
          })),
        );
      });
      await flush();
      return detail(rideId, { userId });
    },

    async start(userId: string, rideId: string): Promise<RideDetailDto> {
      await creatorOnly(rideId, userId);
      await prisma.$transaction(async (tx) => {
        const r = await lockRide(tx, rideId);
        if (r.status !== "OPEN" && r.status !== "FULL") throw errors.conflict("This ride can't be started now.");
        if (now().getTime() < r.departureAt.getTime() - MIN_LEAD_MINUTES * MIN_MS) {
          throw errors.conflict("You can start the ride 15 minutes before departure.");
        }
        await tx.ride.update({ where: { id: rideId }, data: { status: "IN_PROGRESS", version: { increment: 1 } } });
      });
      return detail(rideId, { userId });
    },

    async complete(userId: string, rideId: string): Promise<RideDetailDto> {
      await creatorOnly(rideId, userId);
      await prisma.$transaction(async (tx) => {
        const r = await lockRide(tx, rideId);
        if (r.status !== "IN_PROGRESS") throw errors.conflict("Only a ride in progress can be completed.");
        await tx.ride.update({ where: { id: rideId }, data: { status: "COMPLETED", version: { increment: 1 } } });
      });
      return detail(rideId, { userId });
    },

    async request(userId: string, rideId: string, message?: string): Promise<{ id: string; status: "PENDING" }> {
      const ride = await prisma.ride.findUnique({ where: { id: rideId } });
      const blocked = await blockedIds(userId);
      if (!ride || blocked.includes(ride.creatorId)) throw errors.notFound("We couldn't find that ride.");
      if (ride.creatorId === userId) throw errors.forbidden("You can't request your own ride.");
      if (ride.status === "FULL") throw errors.conflict("This ride is full.");
      if (ride.status !== "OPEN" || ride.departureAt.getTime() <= now().getTime()) {
        throw errors.conflict("This ride isn't open for requests.");
      }
      const lo = new Date(ride.departureAt.getTime() - OVERLAP_WINDOW_MINUTES * MIN_MS);
      const hi = new Date(ride.departureAt.getTime() + OVERLAP_WINDOW_MINUTES * MIN_MS);
      const clash = await prisma.ride.count({
        where: {
          id: { not: rideId },
          status: { in: ["OPEN", "FULL", "IN_PROGRESS"] },
          departureAt: { gte: lo, lte: hi },
          OR: [
            { creatorId: userId },
            { participants: { some: { userId, leftAt: null } } },
            { requests: { some: { userId, status: { in: ["PENDING", "ACCEPTED"] } } } },
          ],
        },
      });
      if (clash > 0) throw errors.conflict("You already have a ride within an hour of this one.");

      const flush = await prisma.$transaction(async (tx) => {
        const locked = await lockRide(tx, rideId);
        if (locked.status !== "OPEN")
          throw errors.conflict(locked.status === "FULL" ? "This ride is full." : undefined);
        const existing = await tx.rideRequest.findUnique({ where: { rideId_userId: { rideId, userId } } });
        if (existing && existing.status !== "CANCELLED") throw errors.conflict("You already requested this ride.");
        const row = existing
          ? await tx.rideRequest.update({
              where: { id: existing.id },
              data: { status: "PENDING", message: message ?? null, decidedAt: null },
            })
          : await tx.rideRequest.create({ data: { rideId, userId, message: message ?? null } });
        const f = await notifyMany(tx, [
          {
            userId: ride.creatorId,
            type: "RIDE_REQUEST",
            title: "New request for your ride",
            body: `Someone asked to join your ride from ${ride.sourceText} to ${ride.destText}.`,
            link: `/automate/${rideId}`,
          },
        ]);
        return { f, id: row.id };
      });
      await flush.f();
      return { id: flush.id, status: "PENDING" };
    },

    async withdraw(userId: string, rideId: string): Promise<{ ok: true }> {
      const r = await prisma.rideRequest.updateMany({
        where: { rideId, userId, status: "PENDING" },
        data: { status: "CANCELLED", decidedAt: now() },
      });
      if (r.count === 0) throw errors.notFound("We couldn't find a pending request for that ride.");
      return { ok: true };
    },

    async requests(userId: string, rideId: string): Promise<RideRequestDto[]> {
      await creatorOnly(rideId, userId);
      const rows = await prisma.rideRequest.findMany({
        where: { rideId },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      });
      return rows.map((q) => ({
        id: q.id,
        status: q.status,
        message: q.message,
        createdAt: q.createdAt.toISOString(),
        rider: { userId: q.user.id, displayName: nameOf(q.user.fullName), avatarUrl: q.user.avatarUrl },
      }));
    },

    /** Accept or reject. Accept holds a row lock on the ride, so the last seat can never be oversold. */
    async decide(userId: string, rideId: string, requestId: string, decision: "ACCEPTED" | "REJECTED") {
      await creatorOnly(rideId, userId);
      const flush = await prisma.$transaction(async (tx) => {
        const ride = await lockRide(tx, rideId);
        const req = await tx.rideRequest.findFirst({ where: { id: requestId, rideId } });
        if (!req) throw errors.notFound("We couldn't find that request.");
        if (req.status !== "PENDING") throw errors.conflict("That request was already handled.");
        if (decision === "ACCEPTED") {
          if (ride.status !== "OPEN" || ride.seatsTaken >= ride.seatsTotal)
            throw errors.conflict("No seats are left on this ride.");
          const taken = ride.seatsTaken + 1;
          await tx.ride.update({
            where: { id: rideId },
            data: { seatsTaken: taken, status: taken >= ride.seatsTotal ? "FULL" : "OPEN", version: { increment: 1 } },
          });
          await tx.rideParticipant.upsert({
            where: { rideId_userId: { rideId, userId: req.userId } },
            create: { rideId, userId: req.userId },
            update: { leftAt: null, joinedAt: now() },
          });
        }
        await tx.rideRequest.update({ where: { id: requestId }, data: { status: decision, decidedAt: now() } });
        return notifyMany(tx, [
          {
            userId: req.userId,
            type: "RIDE_DECISION",
            title: decision === "ACCEPTED" ? "Your ride request was accepted" : "Your ride request was declined",
            body:
              decision === "ACCEPTED"
                ? `You can now see the host's contact details for the ride from ${ride.sourceText} to ${ride.destText}.`
                : `The host declined your request for the ride from ${ride.sourceText} to ${ride.destText}.`,
            link: `/automate/${rideId}`,
          },
        ]);
      });
      await flush();
      return { ok: true as const, status: decision };
    },

    async leave(userId: string, rideId: string): Promise<{ ok: true }> {
      const flush = await prisma.$transaction(async (tx) => {
        const ride = await lockRide(tx, rideId);
        const p = await tx.rideParticipant.findUnique({ where: { rideId_userId: { rideId, userId } } });
        if (!p || p.leftAt !== null) throw errors.notFound("You aren't on this ride.");
        if (ride.status !== "OPEN" && ride.status !== "FULL") throw errors.conflict("You can't leave this ride now.");
        await tx.rideParticipant.update({ where: { rideId_userId: { rideId, userId } }, data: { leftAt: now() } });
        await tx.rideRequest.updateMany({
          where: { rideId, userId, status: "ACCEPTED" },
          data: { status: "CANCELLED", decidedAt: now() },
        });
        await tx.ride.update({
          where: { id: rideId },
          data: { seatsTaken: { decrement: 1 }, status: "OPEN", version: { increment: 1 } },
        });
        return notifyMany(tx, [
          {
            userId: ride.creatorId,
            type: "RIDE_UPDATE",
            title: "A rider left your ride",
            body: `A seat is free again on your ride from ${ride.sourceText} to ${ride.destText}.`,
            link: `/automate/${rideId}`,
          },
        ]);
      });
      await flush();
      return { ok: true };
    },

    async mine(userId: string, role: "created" | "joined" | "requests" | "history") {
      const upcoming: Prisma.RideWhereInput = { status: { in: ["OPEN", "FULL", "IN_PROGRESS"] } };
      const where: Prisma.RideWhereInput =
        role === "created"
          ? { creatorId: userId, ...upcoming }
          : role === "joined"
            ? { ...upcoming, participants: { some: { userId, leftAt: null } } }
            : role === "requests"
              ? { ...upcoming, requests: { some: { userId, status: "PENDING" } } }
              : {
                  status: { in: ["COMPLETED", "CANCELLED"] },
                  OR: [
                    { creatorId: userId },
                    { participants: { some: { userId } } },
                    { requests: { some: { userId } } },
                  ],
                };
      const rows = await prisma.ride.findMany({
        where,
        orderBy: { departureAt: role === "history" ? "desc" : "asc" },
        take: 50,
        include: includeAll,
      });
      const counts = await completedCounts([...new Set(rows.map((r) => r.creatorId))]);
      const reqs = await prisma.rideRequest.findMany({ where: { userId, rideId: { in: rows.map((r) => r.id) } } });
      const mineMap = new Map(reqs.map((q) => [q.rideId, q.status]));
      return rows.map((r) => card(r, { userId }, counts.get(r.creatorId) ?? 0, mineMap.get(r.id) ?? null));
    },

    async block(userId: string, targetId: string): Promise<{ ok: true }> {
      if (targetId === userId) throw errors.validation([{ field: "id", message: "You can't block yourself." }]);
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) throw errors.notFound("We couldn't find that person.");
      await prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
        create: { blockerId: userId, blockedId: targetId },
        update: {},
      });
      return { ok: true };
    },

    async unblock(userId: string, targetId: string): Promise<{ ok: true }> {
      await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
      return { ok: true };
    },
  };
}

export type RidesService = ReturnType<typeof createRidesService>;
