import { idParamsSchema, triggerSosSchema, type TriggerSosInput } from "@saferstreets/shared";
import { z } from "zod";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { respond } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import { idempotency } from "../../middleware/idempotency.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { SosService } from "./sos.service.js";

const anyBody = z.object({ data: z.unknown() });
type Req = { auth?: { userId: string } | undefined; params: unknown; body: unknown };
const uid = (req: Req) => req.auth!.userId;
const idOf = (req: Req) => (req.params as { id: string }).id;

export function sosRoutes(deps: {
  service: SosService;
  prisma: PrismaClient;
  clock: Clock;
  limiters: RateLimiters;
}): RouteDef[] {
  const { service } = deps;
  return [
    {
      method: "post",
      path: "/sos",
      summary: "Trigger a persistent SOS event and notify opted-in nearby users",
      tags: ["sos"],
      auth: "user",
      request: { body: triggerSosSchema },
      responses: { 201: { description: "SOS event created", schema: anyBody } },
      handlers: [
        idempotency({ prisma: deps.prisma, clock: deps.clock }),
        rateLimit(deps.limiters.sosTrigger, "user"),
        respond((req) => service.trigger(uid(req), req.body as TriggerSosInput), 201),
      ],
    },
    {
      method: "get",
      path: "/sos/active",
      summary: "Current active SOS event for the signed-in user",
      tags: ["sos"],
      auth: "user",
      responses: { 200: { description: "Active SOS or null", schema: anyBody } },
      handlers: [respond((req) => service.active(uid(req)))],
    },
    {
      method: "post",
      path: "/sos/:id/resolve",
      summary: "Resolve or cancel an active SOS event",
      tags: ["sos"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Resolved SOS", schema: anyBody } },
      handlers: [respond((req) => service.resolve(uid(req), idOf(req)))],
    },
  ];
}
