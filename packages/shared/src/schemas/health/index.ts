// Health endpoint response shapes (Part B5). No versions or secrets, ever.
import { z } from "zod";

export const liveResponseSchema = z.object({ status: z.literal("ok") });

export const readyCheckSchema = z.enum(["ok", "fail"]);
export const readyResponseSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  checks: z.object({
    database: readyCheckSchema,
    migrations: readyCheckSchema,
    worker: readyCheckSchema,
  }),
});
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
