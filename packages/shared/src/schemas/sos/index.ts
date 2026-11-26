import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../common.js";

export const triggerSosSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  radiusKm: z.number().int().min(1).max(10).optional().default(3),
});
export type TriggerSosInput = z.infer<typeof triggerSosSchema>;

export interface SosEventDto {
  id: string;
  status: "ACTIVE" | "RESOLVED" | "CANCELLED";
  latitude: number;
  longitude: number;
  radiusKm: number;
  notifiedCount: number;
  createdAt: string;
  resolvedAt: string | null;
  deliveryChannel: "in_app_and_email" | "in_app_only";
  pushNote: string;
}
