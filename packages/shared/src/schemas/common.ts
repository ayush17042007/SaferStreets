// Field-level building blocks shared by every module schema.
import { z } from "zod";

export const uuidSchema = z.uuid();
export const idParamsSchema = z.object({ id: uuidSchema });

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);
export const geoPointSchema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema });

/** Trimmed text with length bounds (validate middleware also trims every string). */
export function text(min: number, max: number) {
  return z.string().trim().min(min).max(max);
}

export const addressTextSchema = text(1, 200);
export const emailSchema = z.email().trim().toLowerCase().max(254);
/** Optional 10-digit Indian mobile, optionally prefixed with +91 (appendix-04 S4). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a 10-digit mobile number");

export const isoDateTimeSchema = z.iso.datetime({ offset: true });
