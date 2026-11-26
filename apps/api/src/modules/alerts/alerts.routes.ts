import {
  alertStatusChangeSchema,
  alertSubscriptionSchema,
  alertVoteSchema,
  createAlertSchema,
  idParamsSchema,
  listAlertsQuerySchema,
  type AlertStatusChange,
  type AlertSubscriptionInput,
  type CreateAlert,
  type ListAlertsQuery,
} from "@saferstreets/shared";
import { z } from "zod";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { respond, respondRaw } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import { idempotency } from "../../middleware/idempotency.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { AlertViewer, AlertsService } from "./alerts.service.js";

const anyBody = z.object({ data: z.unknown() });
type Req = {
  auth?: { userId: string; role: AlertViewer["role"] } | undefined;
  params: unknown;
  body: unknown;
  query: unknown;
};
const viewerOf = (req: Req): AlertViewer => ({ userId: req.auth?.userId, role: req.auth?.role });
const uid = (req: Req) => req.auth!.userId;
const idOf = (req: Req) => (req.params as { id: string }).id;
const ok = { 200: { description: "OK", schema: anyBody } };

export function alertsRoutes(deps: {
  service: AlertsService;
  prisma: PrismaClient;
  clock: Clock;
  limiters: RateLimiters;
}): RouteDef[] {
  const { service } = deps;
  const idp = { params: idParamsSchema };
  return [
    {
      method: "get",
      path: "/alerts",
      summary: "Active alerts (guests: rounded location, no description)",
      tags: ["safealert"],
      auth: "public",
      request: { query: listAlertsQuerySchema },
      responses: { 200: { description: "Page of alerts" } },
      handlers: [respondRaw((req) => service.list(viewerOf(req), req.query as unknown as ListAlertsQuery))],
    },
    {
      method: "post",
      path: "/alerts",
      summary: "Post an alert (verified email, account 24 h old, 3 per hour, 10 per day)",
      tags: ["safealert"],
      auth: "user",
      request: { body: createAlertSchema },
      responses: { 201: { description: "Created", schema: anyBody }, 409: { description: "Similar alert nearby" } },
      handlers: [
        idempotency({ prisma: deps.prisma, clock: deps.clock }),
        rateLimit(deps.limiters.alertCreateHourly, "user"),
        rateLimit(deps.limiters.alertCreateDaily, "user"),
        respond((req) => service.create(uid(req), req.body as CreateAlert), 201),
      ],
    },
    {
      method: "get",
      path: "/alerts/:id",
      summary: "Alert detail",
      tags: ["safealert"],
      auth: "public",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.detail(idOf(req), viewerOf(req)))],
    },
    {
      method: "post",
      path: "/alerts/:id/vote",
      summary: "Confirm or dispute (one vote per user, can change)",
      tags: ["safealert"],
      auth: "user",
      request: { ...idp, body: alertVoteSchema },
      responses: ok,
      handlers: [
        respond((req) => service.vote(uid(req), idOf(req), (req.body as { vote: "CONFIRM" | "DISPUTE" }).vote)),
      ],
    },
    {
      method: "delete",
      path: "/alerts/:id/vote",
      summary: "Remove my vote",
      tags: ["safealert"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.unvote(uid(req), idOf(req)))],
    },
    {
      method: "post",
      path: "/alerts/:id/resolve",
      summary: "Mark my alert resolved",
      tags: ["safealert"],
      auth: "user",
      request: idp,
      responses: ok,
      handlers: [respond((req) => service.resolve({ userId: uid(req), role: req.auth!.role }, idOf(req)))],
    },
    {
      method: "patch",
      path: "/admin/alerts/:id/status",
      summary: "Moderator: verify, dismiss (author strike) or remove",
      tags: ["admin"],
      auth: "moderator",
      request: { ...idp, body: alertStatusChangeSchema },
      responses: { ...ok, 409: { description: "Transition not allowed" } },
      handlers: [respond((req) => service.changeStatus(uid(req), idOf(req), req.body as AlertStatusChange))],
    },
    {
      method: "get",
      path: "/me/alert-subscription",
      summary: "My alert area and preferences",
      tags: ["safealert"],
      auth: "user",
      responses: ok,
      handlers: [respond((req) => service.getSubscription(uid(req)))],
    },
    {
      method: "put",
      path: "/me/alert-subscription",
      summary: "Save my alert area (centre, 1-10 km radius, categories, email)",
      tags: ["safealert"],
      auth: "user",
      request: { body: alertSubscriptionSchema },
      responses: ok,
      handlers: [respond((req) => service.putSubscription(uid(req), req.body as AlertSubscriptionInput))],
    },
  ];
}
