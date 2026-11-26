// SafeAlert schemas and DTOs (appendix-02 2D). Alerts are always shown as Unverified until a moderator
// verifies them. SaferStreets never contacts emergency services: the 112 line is always in the copy.
import { z } from "zod";
import { AlertCategory, type AlertStatus, AlertVoteType } from "../../enums.js";
import { cursorQuerySchema } from "../../pagination.js";
import { addressTextSchema, latitudeSchema, longitudeSchema, text } from "../common.js";

export const ALERT_EXPIRY_HOURS = 6;
export const ALERT_MIN_RADIUS_KM = 1;
export const ALERT_MAX_RADIUS_KM = 10;
/** Guests see coordinates rounded to this grid (about 550 m). */
export const GUEST_COORD_STEP = 0.005;

export const createAlertSchema = z.object({
  category: AlertCategory.schema,
  description: text(10, 500),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  addressText: addressTextSchema,
  isAnonymous: z.boolean().default(true),
});
export type CreateAlert = z.infer<typeof createAlertSchema>;

export const alertVoteSchema = z.object({ vote: AlertVoteType.schema });

export const listAlertsQuerySchema = cursorQuerySchema.extend({
  category: AlertCategory.schema.optional(),
  lat: z.coerce.number().pipe(latitudeSchema).optional(),
  lng: z.coerce.number().pipe(longitudeSchema).optional(),
  radiusKm: z.coerce.number().min(0.5).max(50).optional(),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

export const alertStatusChangeSchema = z.object({
  status: z.enum(["VERIFIED", "DISMISSED", "REMOVED"]),
  reason: text(3, 300),
});
export type AlertStatusChange = z.infer<typeof alertStatusChangeSchema>;

export const alertSubscriptionSchema = z
  .object({
    enabled: z.boolean(),
    centerLat: latitudeSchema.nullable(),
    centerLng: longitudeSchema.nullable(),
    radiusKm: z.number().int().min(ALERT_MIN_RADIUS_KM).max(ALERT_MAX_RADIUS_KM),
    /** Empty means every category. */
    categories: z.array(AlertCategory.schema).max(6),
    emailEnabled: z.boolean(),
  })
  .refine((v) => !v.enabled || (v.centerLat !== null && v.centerLng !== null), {
    message: "Choose the centre of your alert area.",
    path: ["centerLat"],
  });
export type AlertSubscriptionInput = z.infer<typeof alertSubscriptionSchema>;

type AlertStatusName = z.infer<typeof AlertStatus.schema>;
type AlertCategoryName = z.infer<typeof AlertCategory.schema>;

export interface AlertDto {
  id: string;
  category: AlertCategoryName;
  status: AlertStatusName;
  /** Always true until a moderator verifies: the UI must label it "Unverified". */
  unverified: boolean;
  /** Null for guests. */
  description: string | null;
  addressText: string | null;
  /** Rounded to about 500 m for guests. */
  latitude: number;
  longitude: number;
  coarseLocation: boolean;
  confirmCount: number;
  disputeCount: number;
  createdAt: string;
  expiresAt: string;
  isMine: boolean;
  myVote: z.infer<typeof AlertVoteType.schema> | null;
  /** Visible only to the author and staff while a new account's alert waits for review. */
  awaitingReview: boolean;
  canResolve: boolean;
  canVote: boolean;
}

export interface AlertSubscriptionDto extends AlertSubscriptionInput {
  /** True when the user may post alerts (verified email, account age, not suspended). */
  canPost: boolean;
  canPostReason: string | null;
}
