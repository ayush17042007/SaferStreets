import type { RequestHandler } from "express";
import { z } from "zod";
import type { RouteDef } from "../../http/routes.js";
import type { DashboardService } from "./dashboard.service.js";

const anyData = z.object({ data: z.unknown() });

export function dashboardRoutes(service: DashboardService): RouteDef[] {
  const card =
    (fn: (userId: string) => Promise<unknown>): RequestHandler =>
    async (req, res, next) => {
      try {
        // Private, per-user data: never cacheable by shared caches.
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ data: await fn(req.auth!.userId) });
      } catch (err) {
        next(err);
      }
    };

  const defs: Array<[string, string, (userId: string) => Promise<unknown>]> = [
    ["setup", "Setup state: first name, trusted contacts, alert area", (u) => service.setup(u)],
    ["journey", "Active journey card (null when none)", (u) => service.journey(u)],
    ["alerts", "Nearby alerts card (inside the saved alert area)", (u) => service.alerts(u)],
    ["rides", "Upcoming ride card (null when none)", (u) => service.rides(u)],
    ["reports", "My recent reports card", (u) => service.reports(u)],
    ["snapshot", "Community counts for the user's area", (u) => service.snapshot(u)],
  ];

  return defs.map(([name, summary, fn]) => ({
    method: "get" as const,
    path: `/me/dashboard/${name}`,
    summary,
    tags: ["dashboard"],
    auth: "user" as const,
    responses: { 200: { description: summary, schema: anyData } },
    handlers: [card(fn)],
  }));
}
