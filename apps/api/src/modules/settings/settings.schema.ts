// system_settings keys, their schemas and defaults (appendix-04 S33, appendix-06 6.2).
import { DEFAULT_REGION } from "@saferstreets/shared";
import { z } from "zod";

export const serviceRegionSchema = z
  .object({
    minLat: z.number().min(-90).max(90),
    maxLat: z.number().min(-90).max(90),
    minLng: z.number().min(-180).max(180),
    maxLng: z.number().min(-180).max(180),
  })
  .refine((r) => r.minLat < r.maxLat && r.minLng < r.maxLng, "min must be below max");

export const emergencyNumbersSchema = z
  .array(
    z.object({
      key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
      label: z.string().min(1).max(40),
      number: z.string().regex(/^\d{3,12}$/),
    }),
  )
  .min(1);

export const thresholdsSchema = z.object({
  /** Distinct confirmations for the "Community-confirmed" badge (2A). */
  reportConfirmations: z.number().int().min(1).max(50),
  /** Journey becomes OVERDUE at ETA + this (2C, B3). */
  journeyOverdueMinutes: z.number().int().min(1).max(60),
  /** Default contact escalation after ETA; users choose 20-60 (2C). */
  journeyEscalationMinutesDefault: z.number().int().min(20).max(60),
  alertExpiryHours: z.number().int().min(1).max(72),
  alertMinAccountAgeHours: z.number().int().min(0).max(720),
  alertDismissStrikeLimit: z.number().int().min(1).max(20),
  duplicateReportRadiusM: z.number().int().min(10).max(1000),
  duplicateAlertRadiusM: z.number().int().min(10).max(2000),
  duplicateAlertWindowMinutes: z.number().int().min(1).max(240),
});

export const SETTINGS = {
  serviceRegion: {
    schema: serviceRegionSchema,
    /** P5 default: the Kota campus area. Admins change it in system settings (Prompt 10). */
    default: DEFAULT_REGION,
  },
  emergencyNumbers: {
    schema: emergencyNumbersSchema,
    /** appendix-01 A1. "Verify numbers before launch." */
    default: [
      { key: "emergency", label: "Emergency", number: "112" },
      { key: "police", label: "Police", number: "100" },
      { key: "ambulance", label: "Ambulance", number: "108" },
      { key: "womenHelpline", label: "Women helpline", number: "1091" },
      { key: "fire", label: "Fire", number: "101" },
    ],
  },
  thresholds: {
    schema: thresholdsSchema,
    default: {
      reportConfirmations: 3,
      journeyOverdueMinutes: 10,
      journeyEscalationMinutesDefault: 30,
      alertExpiryHours: 6,
      alertMinAccountAgeHours: 24,
      alertDismissStrikeLimit: 3,
      duplicateReportRadiusM: 100,
      duplicateAlertRadiusM: 200,
      duplicateAlertWindowMinutes: 30,
    },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
