// JourneyGuard schemas and DTOs (appendix-02 2C). Honest scope: no live tracking; only an expected
// arrival time, an overdue reminder and one email to a trusted contact.
import { z } from "zod";
import { type JourneyStatus } from "../../enums.js";
import { cursorQuerySchema } from "../../pagination.js";
import { isoDateTimeSchema, latitudeSchema, longitudeSchema, text, uuidSchema } from "../common.js";

export const MAX_EXTENSIONS = 2;
export const ESCALATION_MINUTES_DEFAULT = 30;
export const ESCALATION_MINUTES_MIN = 20;
export const ESCALATION_MINUTES_MAX = 60;
export const MIN_ETA_MINUTES = 5;
export const MAX_ETA_HOURS = 24;
/** Minutes after the expected arrival when the user is asked "Have you arrived?". */
export const OVERDUE_AFTER_MINUTES = 10;

export const routeGeometrySchema = z.array(z.tuple([longitudeSchema, latitudeSchema])).min(2).max(2000);

export type JourneySafetyState = "NORMAL" | "DEVIATED" | "STOPPED" | "LOST_SIGNAL" | "OVERDUE" | "SOS";

export const startJourneySchema = z.object({
  destinationText: text(1, 200),
  destLat: latitudeSchema.optional(),
  destLng: longitudeSchema.optional(),
  startText: text(1, 200).optional(),
  startLat: latitudeSchema.optional(),
  startLng: longitudeSchema.optional(),
  trackingEnabled: z.boolean().optional().default(false),
  routeGeometry: routeGeometrySchema.optional(),
  expectedArrivalAt: isoDateTimeSchema,
  emergencyContactId: uuidSchema,
  notes: text(1, 300).optional(),
});
export type StartJourney = z.infer<typeof startJourneySchema>;

export const locationUpdateSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  accuracyM: z.number().min(0).max(10_000).optional(),
  speedMps: z.number().min(0).max(200).optional(),
  recordedAt: isoDateTimeSchema.optional(),
});
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;

export const extendJourneySchema = z.object({
  minutes: z.union([z.literal(15), z.literal(30)]),
});

export const journeyHistoryQuerySchema = cursorQuerySchema;

export const trackTokenParamsSchema = z.object({ token: z.string().min(20).max(100) });

type JourneyStatusName = z.infer<typeof JourneyStatus.schema>;

export interface JourneyLocationDto {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  recordedAt: string;
}

export interface JourneyDto {
  id: string;
  destinationText: string;
  destLat: number | null;
  destLng: number | null;
  startText: string | null;
  startLat: number | null;
  startLng: number | null;
  trackingEnabled: boolean;
  routeGeometry: Array<[number, number]> | null;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  safetyState: JourneySafetyState;
  sosTriggeredAt: string | null;
  notes: string | null;
  startedAt: string;
  expectedArrivalAt: string;
  /** expectedArrivalAt + 10 min: when the in-app and email reminder goes to the user. */
  overdueAfterAt: string;
  /** expectedArrivalAt + escalation window: when the trusted contact is emailed once. */
  escalationAt: string;
  escalationMinutes: number;
  status: JourneyStatusName;
  extensionsUsed: number;
  extensionsLeft: number;
  overdueAt: string | null;
  contactNotifiedAt: string | null;
  completedAt: string | null;
  contact: { id: string; name: string; relationship: string | null } | null;
  /** The contact email could not be delivered: the user must call them directly. */
  contactEmailFailed: boolean;
  /** The contact asked to stop receiving emails: the user must call them directly. */
  contactOptedOut: boolean;
  /** Present only in the response that starts the journey (the token is never stored in clear). */
  trackUrl?: string;
}

/** What a trusted contact may see through the share link. Nothing else, ever. */
export interface TrackDto {
  firstName: string;
  destinationText: string;
  expectedArrivalAt: string;
  status: "ON_THE_WAY" | "RUNNING_LATE" | "ARRIVED" | "ENDED";
  trackingEnabled: boolean;
  safetyState: JourneySafetyState;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
}
