import {
  extendJourneySchema,
  idParamsSchema,
  journeyHistoryQuerySchema,
  locationUpdateSchema,
  startJourneySchema,
  trackTokenParamsSchema,
  type LocationUpdateInput,
  type StartJourney,
} from "@saferstreets/shared";
import { z } from "zod";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { respond, respondRaw } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import { idempotency } from "../../middleware/idempotency.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { JourneysService } from "./journeys.service.js";

const anyBody = z.object({ data: z.unknown() });
type Req = { auth?: { userId: string } | undefined; params: unknown; body: unknown; query: unknown };
const uid = (req: Req) => req.auth!.userId;
const idOf = (req: Req) => (req.params as { id: string }).id;
const tokenOf = (req: Req) => (req.params as { token: string }).token;
const ok = { 200: { description: "OK", schema: anyBody } };

export function journeysRoutes(deps: {
  service: JourneysService;
  prisma: PrismaClient;
  clock: Clock;
  limiters: RateLimiters;
}): RouteDef[] {
  const { service } = deps;
  const idp = { params: idParamsSchema };
  return [
    {
      method: "post",
      path: "/journeys",
      summary: "Start a journey (3 per hour, one active at a time)",
      tags: ["journeyguard"],
      auth: "user",
      request: { body: startJourneySchema },
      responses: { 201: { description: "Started", schema: anyBody }, 409: { description: "Already active" } },
      handlers: [
        idempotency({ prisma: deps.prisma, clock: deps.clock }),
        rateLimit(deps.limiters.journeyStart, "user"),
        respond((req) => service.start(uid(req), req.body as StartJourney), 201),
      ],
    },
    {
      method: "get",
      path: "/journeys/active",
      summary: "My active or overdue journey (data is null when none)",
      tags: ["journeyguard"],
      auth: "user",
      responses: ok,
      handlers: [respond((req) => service.active(uid(req)))],
    },
    {
      method: "get",
      path: "/journeys/history",
      summary: "My finished journeys (cursor pagination)",
      tags: ["journeyguard"],
      auth: "user",
      request: { query: journeyHistoryQuerySchema },
      responses: { 200: { description: "Page of journeys" } },
      handlers: [
        respondRaw((req) =>
          service.history(uid(req), req.query as unknown as { cursor?: string | undefined; limit: number }),
        ),
      ],
    },
    {
      method: "get",
      path: "/journeys/:id",
      summary: "One of my journeys",
      tags: ["journeyguard"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.detail(uid(req), idOf(req)))],
    },
    {
      method: "post",
      path: "/journeys/:id/complete",
      summary: "I've arrived safely (emails an all-clear if the contact was alerted)",
      tags: ["journeyguard"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.finish(uid(req), idOf(req), "COMPLETED"))],
    },
    {
      method: "post",
      path: "/journeys/:id/extend",
      summary: "Extend the expected arrival by 15 or 30 minutes (twice at most)",
      tags: ["journeyguard"],
      auth: "user",
      request: { ...idp, body: extendJourneySchema },
      responses: ok,
      handlers: [respond((req) => service.extend(uid(req), idOf(req), (req.body as { minutes: 15 | 30 }).minutes))],
    },
    {
      method: "post",
      path: "/journeys/:id/cancel",
      summary: "Cancel a journey",
      tags: ["journeyguard"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.finish(uid(req), idOf(req), "CANCELLED"))],
    },
    {
      method: "post",
      path: "/journeys/:id/location",
      summary: "Record a live location update for an active journey",
      tags: ["journeyguard"],
      auth: "user",
      request: { ...idp, body: locationUpdateSchema },
      responses: ok,
      handlers: [respond((req) => service.recordLocation(uid(req), idOf(req), req.body as LocationUpdateInput))],
    },
    {
      method: "post",
      path: "/journeys/:id/sos",
      summary: "Trigger manual SOS during an active journey",
      tags: ["journeyguard"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.triggerSos(uid(req), idOf(req)))],
    },
    {
      method: "get",
      path: "/track/:token",
      summary: "Trusted-contact page: first name, destination, expected arrival, status only",
      tags: ["journeyguard"],
      auth: "public",
      request: { params: trackTokenParamsSchema },
      responses: { ...ok, 404: { description: "Neutral: invalid, unknown or expired" } },
      handlers: [respond((req) => service.track(tokenOf(req)))],
    },
    {
      method: "post",
      path: "/track/:token/unsubscribe",
      summary: "Trusted contact opts out of journey emails",
      tags: ["journeyguard"],
      auth: "public",
      request: { params: trackTokenParamsSchema },
      responses: ok,
      handlers: [respond((req) => service.unsubscribe(tokenOf(req)))],
    },
  ];
}
