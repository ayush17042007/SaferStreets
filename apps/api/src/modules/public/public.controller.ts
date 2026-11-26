import type { RequestHandler } from "express";
import type { SettingsService } from "../settings/settings.service.js";

export function createPublicController(settings: SettingsService): {
  emergencyNumbers: RequestHandler;
  region: RequestHandler;
} {
  const emergencyNumbers: RequestHandler = async (_req, res, next) => {
    try {
      const data = await settings.get("emergencyNumbers");
      // Safe to cache briefly: numbers change rarely and carry no user data.
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };
  const region: RequestHandler = async (_req, res, next) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ data: await settings.get("serviceRegion") });
    } catch (err) {
      next(err);
    }
  };
  return { emergencyNumbers, region };
}
