import { createFlagSchema } from "@saferstreets/shared";
import { z } from "zod";
import { respond } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { FlagsService } from "./flags.service.js";

export function flagsRoutes(deps: { service: FlagsService; limiters: RateLimiters }): RouteDef[] {
  return [
    {
      method: "post",
      path: "/flags",
      summary: "Flag a report, ride, alert or user for moderators (20 per day)",
      tags: ["flags"],
      auth: "user",
      request: { body: createFlagSchema },
      responses: {
        201: { description: "Flagged", schema: z.object({ data: z.unknown() }) },
        409: { description: "Already flagged" },
      },
      handlers: [
        rateLimit(deps.limiters.flagCreate, "user"),
        respond(
          (req) =>
            deps.service.create(
              req.auth!.userId,
              req.body as {
                targetType: "REPORT" | "RIDE" | "ALERT" | "USER" | "RIDE_MESSAGE";
                targetId: string;
                reason: string;
              },
            ),
          201,
        ),
      ],
    },
  ];
}
