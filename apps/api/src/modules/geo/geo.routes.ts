import { latitudeSchema, longitudeSchema } from "@saferstreets/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { RouteDef } from "../../http/routes.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { GeoService } from "./geo.service.js";

const searchQuery = z.object({ q: z.string().trim().min(2, "Type at least 2 characters.").max(100) });
const reverseQuery = z.object({
  lat: z.coerce.number().pipe(latitudeSchema),
  lng: z.coerce.number().pipe(longitudeSchema),
});
const placeSchema = z.object({ label: z.string(), lat: z.number(), lng: z.number() });
const searchResponse = z.object({ data: z.array(placeSchema) });
const reverseResponse = z.object({ data: z.object({ label: z.string().nullable() }) });

export function geoRoutes(deps: { service: GeoService; limiters: RateLimiters }): RouteDef[] {
  const { service, limiters } = deps;
  const search: RequestHandler = async (req, res, next) => {
    try {
      const { q } = req.query as unknown as z.infer<typeof searchQuery>;
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json({ data: await service.search(q) });
    } catch (err) {
      next(err);
    }
  };
  const reverse: RequestHandler = async (req, res, next) => {
    try {
      const { lat, lng } = req.query as unknown as z.infer<typeof reverseQuery>;
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json({ data: { label: await service.reverse(lat, lng) } });
    } catch (err) {
      next(err);
    }
  };
  return [
    {
      method: "get",
      path: "/geo/search",
      summary: "Search places inside the service area (proxied and cached)",
      tags: ["geo"],
      auth: "user",
      request: { query: searchQuery },
      responses: {
        200: { description: "Matching places", schema: searchResponse },
        503: { description: "Search not available" },
      },
      handlers: [rateLimit(limiters.geoSearch, "user"), search],
    },
    {
      method: "get",
      path: "/geo/reverse",
      summary: "Address for a pin (proxied and cached)",
      tags: ["geo"],
      auth: "user",
      request: { query: reverseQuery },
      responses: {
        200: { description: "Address or null", schema: reverseResponse },
        503: { description: "Lookup not available" },
      },
      handlers: [rateLimit(limiters.geoReverse, "user"), reverse],
    },
  ];
}
