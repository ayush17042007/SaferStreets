import type { RequestHandler } from "express";
import type { HealthService } from "./health.service.js";

export function createHealthController(service: HealthService): { live: RequestHandler; ready: RequestHandler } {
  const live: RequestHandler = (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok" });
  };

  const ready: RequestHandler = async (_req, res, next) => {
    try {
      const result = await service.ready();
      res.setHeader("Cache-Control", "no-store");
      res.status(result.status === "ok" ? 200 : 503).json(result);
    } catch (err) {
      next(err);
    }
  };

  return { live, ready };
}
