// SafeRoute schemas and DTOs (appendix-02 2A, appendix-04 S6-S9, appendix-07 7.4).
import { z } from "zod";
import { ReportCategory, ReportStatus } from "../../enums.js";
import { cursorQuerySchema } from "../../pagination.js";
import { addressTextSchema, latitudeSchema, longitudeSchema, text, uuidSchema } from "../common.js";

export const MAX_REPORT_PHOTOS = 4;
export const DUPLICATE_RADIUS_M = 100;

export const createReportSchema = z.object({
  category: ReportCategory.schema,
  title: text(5, 80),
  description: text(10, 1000),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  addressText: addressTextSchema.optional(),
  /** Upload ids from POST /uploads/sign (purpose REPORT), already uploaded to storage. */
  photoUploadIds: z.array(uuidSchema).max(MAX_REPORT_PHOTOS).default([]),
});
export type CreateReport = z.infer<typeof createReportSchema>;

/** Edit own report while SUBMITTED. `version` is the optimistic-concurrency token from the detail response. */
export const editReportSchema = z.object({
  version: z.number().int().min(0),
  title: text(5, 80).optional(),
  description: text(10, 1000).optional(),
  addressText: addressTextSchema.optional(),
  category: ReportCategory.schema.optional(),
});

export type EditReportInput = z.infer<typeof editReportSchema>;

export const reportStatusChangeSchema = z.object({
  status: ReportStatus.schema,
  note: text(1, 1000).optional(),
});
export type ReportStatusChange = z.infer<typeof reportStatusChangeSchema>;

const boolQuery = z.enum(["true", "false"]).transform((v) => v === "true");
export const listReportsQuerySchema = cursorQuerySchema.extend({
  category: ReportCategory.schema.optional(),
  status: ReportStatus.schema.optional(),
  lat: z.coerce.number().pipe(latitudeSchema).optional(),
  lng: z.coerce.number().pipe(longitudeSchema).optional(),
  radius: z.coerce.number().min(0.1).max(50).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  mine: boolQuery.optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

export const nearbyDuplicatesQuerySchema = z.object({
  lat: z.coerce.number().pipe(latitudeSchema),
  lng: z.coerce.number().pipe(longitudeSchema),
  category: ReportCategory.schema,
});

export interface ReportCardDto {
  id: string;
  category: z.infer<typeof ReportCategory.schema>;
  title: string;
  addressText: string | null;
  status: z.infer<typeof ReportStatus.schema>;
  confirmationCount: number;
  communityConfirmed: boolean;
  latitude: number;
  longitude: number;
  createdAt: string;
  /** Distance in km from the search point, when lat/lng were given. */
  distanceKm?: number;
  photoUrl: string | null;
  isMine: boolean;
}

export interface ReportDetailDto extends ReportCardDto {
  description: string;
  photos: Array<{ url: string; alt: string }>;
  version: number;
  confirmedByMe: boolean;
  canEdit: boolean;
  canConfirm: boolean;
  /** Moderator note on the latest decision. */
  moderatorNote: string | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string; by?: string }>;
  /** Only moderators and admins see who filed it. */
  author?: { id: string; name: string | null };
}

export interface DuplicateDto {
  id: string;
  category: string;
  title: string;
  distanceM: number;
  confirmationCount: number;
}

export const compareRoutesSchema = z.object({
  originLat: latitudeSchema,
  originLng: longitudeSchema,
  destLat: latitudeSchema,
  destLng: longitudeSchema,
});
export type CompareRoutesInput = z.infer<typeof compareRoutesSchema>;

export interface RouteHazardDto {
  id: string;
  kind: "report" | "alert";
  category: string;
  title: string;
  status: string;
  distanceM: number;
}

export interface RouteAlternativeDto {
  id: string;
  summary: string;
  distanceM: number;
  durationS: number;
  coordinates: Array<[number, number]>;
  safetyScore: number;
  incidentCount: number;
  verifiedCount: number;
  alertCount: number;
  explanation: string;
  hazards: RouteHazardDto[];
}

/** A safety incident (report or alert) with coordinates, for map display. */
export interface IncidentMapPin {
  id: string;
  kind: "report" | "alert";
  lat: number;
  lng: number;
  label: string;
  status: string;
  category: string;
}

export interface CompareRoutesResponseDto {
  routes: RouteAlternativeDto[];
  recommendedRouteId: string;
  provider: string;
  /** All relevant incidents near the routes, for map display. */
  incidentPins: IncidentMapPin[];
}
