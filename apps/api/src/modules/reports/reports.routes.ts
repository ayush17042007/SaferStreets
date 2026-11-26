import {
  compareRoutesSchema,
  createReportSchema,
  editReportSchema,
  idParamsSchema,
  listReportsQuerySchema,
  nearbyDuplicatesQuerySchema,
  reportStatusChangeSchema,
  type CompareRoutesInput,
  type CreateReport,
  type EditReportInput,
  type ListReportsQuery,
  type ReportStatusChange,
} from "@saferstreets/shared";
import { z } from "zod";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { respond, respondRaw } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import { idempotency } from "../../middleware/idempotency.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { RoutingClient } from "../geo/routing.client.js";
import type { ReportsService, Viewer } from "./reports.service.js";
import { scoreRouteAlternatives } from "./saferoute.scoring.js";

const anyBody = z.object({ data: z.unknown() });

type Req = {
  auth?: { userId: string; role: Viewer["role"] } | undefined;
  params: unknown;
  body: unknown;
  query: unknown;
};
const viewerOf = (req: Req): Viewer => ({ userId: req.auth?.userId, role: req.auth?.role });
const idOf = (req: Req) => (req.params as { id: string }).id;

export function reportsRoutes(deps: {
  service: ReportsService;
  prisma: PrismaClient;
  clock: Clock;
  limiters: RateLimiters;
  routing?: RoutingClient | null;
}): RouteDef[] {
  const { service, prisma, clock, limiters, routing } = deps;
  return [
    {
      method: "get",
      path: "/reports",
      summary: "List reports (public view for guests; cursor pagination; filters)",
      tags: ["saferoute"],
      auth: "public",
      request: { query: listReportsQuerySchema },
      responses: { 200: { description: "Page of report cards" } },
      handlers: [respondRaw((req) => service.list(viewerOf(req), req.query as unknown as ListReportsQuery))],
    },
    {
      // Registered before /reports/:id so "nearby-duplicates" is never read as an id.
      method: "get",
      path: "/reports/nearby-duplicates",
      summary: "Similar open reports within 100 m (same category)",
      tags: ["saferoute"],
      auth: "user",
      request: { query: nearbyDuplicatesQuerySchema },
      responses: { 200: { description: "Up to 3 similar reports", schema: anyBody } },
      handlers: [
        respond((req) => {
          const q = req.query as unknown as z.infer<typeof nearbyDuplicatesQuerySchema>;
          return service.nearbyDuplicates({ lat: q.lat, lng: q.lng }, q.category);
        }),
      ],
    },
    {
      method: "post",
      path: "/reports",
      summary: "File a report (5 per day, Idempotency-Key supported)",
      tags: ["saferoute"],
      auth: "user",
      request: { body: createReportSchema },
      responses: { 201: { description: "Created", schema: anyBody }, 429: { description: "Daily limit reached" } },
      handlers: [
        idempotency({ prisma: deps.prisma, clock: deps.clock }),
        rateLimit(deps.limiters.reportCreate, "user"),
        respond((req) => service.create(req.auth!.userId, req.body as CreateReport), 201),
      ],
    },
    {
      method: "get",
      path: "/reports/:id",
      summary: "Report detail with status history (guests: public view, author hidden)",
      tags: ["saferoute"],
      auth: "public",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Report", schema: anyBody } },
      handlers: [respond((req) => service.detail(idOf(req), viewerOf(req)))],
    },
    {
      method: "patch",
      path: "/reports/:id",
      summary: "Edit my report while it is Submitted",
      tags: ["saferoute"],
      auth: "user",
      request: { params: idParamsSchema, body: editReportSchema },
      responses: { 200: { description: "Updated", schema: anyBody }, 409: { description: "Reviewed or changed" } },
      handlers: [respond((req) => service.edit(req.auth!.userId, idOf(req), req.body as EditReportInput))],
    },
    {
      method: "delete",
      path: "/reports/:id",
      summary: "Delete my report while it is Submitted",
      tags: ["saferoute"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Deleted", schema: anyBody } },
      handlers: [
        respond(async (req) => {
          await service.remove(req.auth!.userId, idOf(req));
          return { ok: true };
        }),
      ],
    },
    {
      method: "post",
      path: "/reports/:id/confirm",
      summary: "Confirm someone else's report (once per user)",
      tags: ["saferoute"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Confirmed", schema: anyBody }, 409: { description: "Already confirmed" } },
      handlers: [respond((req) => service.confirm(req.auth!.userId, idOf(req)))],
    },
    {
      method: "delete",
      path: "/reports/:id/confirm",
      summary: "Remove my confirmation",
      tags: ["saferoute"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Removed", schema: anyBody } },
      handlers: [respond((req) => service.unconfirm(req.auth!.userId, idOf(req)))],
    },
    {
      method: "patch",
      path: "/admin/reports/:id/status",
      summary: "Moderator status change (history, notification and audit row in one transaction)",
      tags: ["admin"],
      auth: "moderator",
      request: { params: idParamsSchema, body: reportStatusChangeSchema },
      responses: {
        200: { description: "Updated report", schema: anyBody },
        409: { description: "Transition not allowed" },
      },
      handlers: [
        respond((req) => service.changeStatus({ userId: req.auth!.userId }, idOf(req), req.body as ReportStatusChange)),
      ],
    },
    {
      method: "post",
      path: "/saferoute/routes",
      summary: "Compare route alternatives using real safety reports and active alerts",
      tags: ["saferoute"],
      auth: "public",
      request: { body: compareRoutesSchema },
      responses: {
        200: { description: "Scored route alternatives", schema: anyBody },
        503: { description: "Routing provider not configured or unavailable" },
      },
      handlers: [
        rateLimit(limiters.geoSearch, "ip"),
        respond(async (req) => {
          if (!routing) {
            throw errors.serviceUnavailable(
              "Route comparison is not configured. Set OPENROUTESERVICE_API_KEY or ROUTING_API_URL on the server.",
            );
          }
          const body = req.body as CompareRoutesInput;
          let raw;
          try {
            raw = await routing.getAlternatives(
              { lat: body.originLat, lng: body.originLng },
              { lat: body.destLat, lng: body.destLng },
            );
          } catch {
            throw errors.serviceUnavailable("Could not reach the routing service just now. Try again in a moment.");
          }
          if (raw.length === 0) {
            throw errors.notFound("No routes found between those two locations.");
          }
          const allCoords = raw.flatMap((r) => r.coordinates);
          const lats = allCoords.map((c) => c[1]);
          const lngs = allCoords.map((c) => c[0]);
          const pad = 0.005;
          const now = clock.now();
          const [reports, alerts] = await Promise.all([
            prisma.report.findMany({
              where: {
                deletedAt: null,
                status: { not: "REJECTED" },
                latitude: { gte: Math.min(...lats) - pad, lte: Math.max(...lats) + pad },
                longitude: { gte: Math.min(...lngs) - pad, lte: Math.max(...lngs) + pad },
              },
              select: {
                id: true,
                category: true,
                title: true,
                status: true,
                latitude: true,
                longitude: true,
                confirmationCount: true,
                createdAt: true,
              },
              take: 500,
            }),
            prisma.alert.findMany({
              where: {
                status: { in: ["ACTIVE", "VERIFIED"] },
                expiresAt: { gt: now },
                latitude: { gte: Math.min(...lats) - pad, lte: Math.max(...lats) + pad },
                longitude: { gte: Math.min(...lngs) - pad, lte: Math.max(...lngs) + pad },
              },
              select: {
                id: true,
                category: true,
                description: true,
                status: true,
                latitude: true,
                longitude: true,
                confirmCount: true,
                createdAt: true,
              },
              take: 200,
            }),
          ]);

          const scored = scoreRouteAlternatives(
            raw,
            reports.map((r) => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude) })),
            alerts.map((a) => ({ ...a, latitude: Number(a.latitude), longitude: Number(a.longitude) })),
            now,
          );
          return { ...scored, provider: routing.provider };
        }),
      ],
    },
  ];
}
