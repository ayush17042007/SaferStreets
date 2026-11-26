// Health endpoints (Part B5). Mounted at the API root (/health/*) for platform probes and under
// /api (/api/health/*) so they are reachable through the Next.js rewrite. No secrets or versions.
import { liveResponseSchema, readyResponseSchema } from "@saferstreets/shared";
import type { RouteDef } from "../../http/routes.js";
import { createHealthController } from "./health.controller.js";
import type { HealthService } from "./health.service.js";

export const HEALTH_MOUNTS = ["", "/api"] as const;

export function healthRoutes(service: HealthService): RouteDef[] {
  const c = createHealthController(service);
  return [
    {
      method: "get",
      path: "/health/live",
      summary: "Liveness: the process is up",
      tags: ["health"],
      auth: "public",
      responses: { 200: { description: "Process is up", schema: liveResponseSchema } },
      handlers: [c.live],
    },
    {
      method: "get",
      path: "/health/ready",
      summary: "Readiness: database reachable, migrations applied, worker heartbeat fresh",
      tags: ["health"],
      auth: "public",
      responses: {
        200: { description: "Ready", schema: readyResponseSchema },
        503: { description: "Not ready (see checks)", schema: readyResponseSchema },
      },
      handlers: [c.ready],
    },
  ];
}
