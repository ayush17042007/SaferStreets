import {
  cancelRideSchema,
  createRideSchema,
  editRideSchema,
  idParamsSchema,
  listRidesQuerySchema,
  myRidesQuerySchema,
  requestIdParamsSchema,
  rideRequestSchema,
  type CreateRide,
  type EditRide,
  type ListRidesQuery,
} from "@saferstreets/shared";
import { z } from "zod";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { respond, respondRaw } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import { idempotency } from "../../middleware/idempotency.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { RidesService } from "./rides.service.js";

const anyBody = z.object({ data: z.unknown() });
type Req = { auth?: { userId: string } | undefined; params: unknown; body: unknown; query: unknown };
const uid = (req: Req) => req.auth!.userId;
const idOf = (req: Req) => (req.params as { id: string }).id;
const ok = { 200: { description: "OK", schema: anyBody } };

export function ridesRoutes(deps: {
  service: RidesService;
  prisma: PrismaClient;
  clock: Clock;
  limiters: RateLimiters;
}): RouteDef[] {
  const { service } = deps;
  const idp = { params: idParamsSchema };
  return [
    {
      method: "get",
      path: "/rides",
      summary: "Search open rides (guests see no host details)",
      tags: ["automate"],
      auth: "public",
      request: { query: listRidesQuerySchema },
      responses: { 200: { description: "Page of rides" } },
      handlers: [
        respondRaw((req) =>
          service.list({ userId: (req as Req).auth?.userId }, req.query as unknown as ListRidesQuery),
        ),
      ],
    },
    {
      // Before /rides/:id so "mine" is never read as an id.
      method: "get",
      path: "/rides/mine",
      summary: "My rides: created, joined, pending requests, history",
      tags: ["automate"],
      auth: "user",
      request: { query: myRidesQuerySchema },
      responses: ok,
      handlers: [
        respond((req) => service.mine(uid(req), (req.query as unknown as z.infer<typeof myRidesQuerySchema>).role)),
      ],
    },
    {
      method: "post",
      path: "/rides",
      summary: "Offer a ride (max 3 open, Idempotency-Key supported)",
      tags: ["automate"],
      auth: "user",
      request: { body: createRideSchema },
      responses: { 201: { description: "Created", schema: anyBody } },
      handlers: [
        idempotency({ prisma: deps.prisma, clock: deps.clock }),
        respond((req) => service.create(uid(req), req.body as CreateRide), 201),
      ],
    },
    {
      method: "get",
      path: "/rides/:id",
      summary: "Ride detail (phones only for the host and accepted riders)",
      tags: ["automate"],
      auth: "public",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.detail(idOf(req), { userId: (req as Req).auth?.userId }))],
    },
    {
      method: "patch",
      path: "/rides/:id",
      summary: "Edit my ride before anyone joins",
      tags: ["automate"],
      auth: "user",
      request: { ...idp, body: editRideSchema },
      responses: ok,
      handlers: [respond((req) => service.edit(uid(req), idOf(req), req.body as EditRide))],
    },
    {
      method: "post",
      path: "/rides/:id/cancel",
      summary: "Cancel my ride with a reason",
      tags: ["automate"],
      auth: "user",
      request: { ...idp, body: cancelRideSchema },
      responses: ok,
      handlers: [respond((req) => service.cancel(uid(req), idOf(req), (req.body as { reason: string }).reason))],
    },
    {
      method: "post",
      path: "/rides/:id/start",
      summary: "Start my ride",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.start(uid(req), idOf(req)))],
    },
    {
      method: "post",
      path: "/rides/:id/complete",
      summary: "Complete my ride",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.complete(uid(req), idOf(req)))],
    },
    {
      method: "post",
      path: "/rides/:id/requests",
      summary: "Ask to join a ride (10 per day)",
      tags: ["automate"],
      auth: "user",
      request: { ...idp, body: rideRequestSchema },
      responses: { 201: { description: "Requested", schema: anyBody } },
      handlers: [
        idempotency({ prisma: deps.prisma, clock: deps.clock }),
        rateLimit(deps.limiters.rideRequestCreate, "user"),
        respond((req) => service.request(uid(req), idOf(req), (req.body as { message?: string }).message), 201),
      ],
    },
    {
      method: "get",
      path: "/rides/:id/requests",
      summary: "Requests on my ride",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.requests(uid(req), idOf(req)))],
    },
    {
      method: "delete",
      path: "/rides/:id/requests/mine",
      summary: "Withdraw my pending request",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.withdraw(uid(req), idOf(req)))],
    },
    {
      method: "post",
      path: "/rides/:id/requests/:reqId/accept",
      summary: "Accept a request (row-locked; 409 when no seats are left)",
      tags: ["automate"],
      auth: "user",
      request: { params: requestIdParamsSchema },
      responses: { ...ok, 409: { description: "No seats left or already handled" } },
      handlers: [
        respond((req) => service.decide(uid(req), idOf(req), (req.params as { reqId: string }).reqId, "ACCEPTED")),
      ],
    },
    {
      method: "post",
      path: "/rides/:id/requests/:reqId/reject",
      summary: "Decline a request",
      tags: ["automate"],
      auth: "user",
      request: { params: requestIdParamsSchema },
      responses: ok,
      handlers: [
        respond((req) => service.decide(uid(req), idOf(req), (req.params as { reqId: string }).reqId, "REJECTED")),
      ],
    },
    {
      method: "post",
      path: "/rides/:id/leave",
      summary: "Leave a ride I joined",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.leave(uid(req), idOf(req)))],
    },
    {
      method: "post",
      path: "/users/:id/block",
      summary: "Block a user (they no longer see my rides, I no longer see theirs)",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.block(uid(req), idOf(req)))],
    },
    {
      method: "delete",
      path: "/users/:id/block",
      summary: "Unblock a user",
      tags: ["automate"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.unblock(uid(req), idOf(req)))],
    },
  ];
}
