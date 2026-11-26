// Public (no login) endpoint shapes.
import { z } from "zod";

export const emergencyNumberSchema = z.object({
  key: z.string(),
  label: z.string(),
  number: z.string(),
});
export type EmergencyNumberDto = z.infer<typeof emergencyNumberSchema>;

export const emergencyNumbersResponseSchema = z.object({
  data: z.array(emergencyNumberSchema),
});

export const regionResponseSchema = z.object({
  data: z.object({ minLat: z.number(), maxLat: z.number(), minLng: z.number(), maxLng: z.number() }),
});
