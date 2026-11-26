// AutoMate schemas and DTOs (appendix-02 2B, appendix-04 S10-S13, appendix-07 7.4).
import { z } from "zod";
import { type RideRequestStatus, type RideStatus } from "../../enums.js";
import { cursorQuerySchema } from "../../pagination.js";
import { isoDateTimeSchema, latitudeSchema, longitudeSchema, text } from "../common.js";

export const MIN_SEATS = 1;
export const MAX_SEATS = 3;
export const MIN_FARE = 10;
export const MAX_FARE = 5000;
export const MIN_ROUTE_METERS = 300;
export const MIN_LEAD_MINUTES = 15;
export const MAX_LEAD_DAYS = 14;
export const MAX_OPEN_RIDES = 3;
export const OVERLAP_WINDOW_MINUTES = 60;
export const MAX_REQUESTS_PER_DAY = 10;

const placeSchema = z.object({
  text: text(1, 200),
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export const createRideSchema = z.object({
  source: placeSchema,
  destination: placeSchema,
  departureAt: isoDateTimeSchema,
  seatsTotal: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
  estimatedTotalFare: z.number().int().min(MIN_FARE).max(MAX_FARE),
  note: text(1, 300).optional(),
});
export type CreateRide = z.infer<typeof createRideSchema>;

/** Edit before any request is accepted. `version` is the optimistic token from the detail response. */
export const editRideSchema = z
  .object({
    version: z.number().int().min(0),
    departureAt: isoDateTimeSchema.optional(),
    seatsTotal: z.number().int().min(MIN_SEATS).max(MAX_SEATS).optional(),
    estimatedTotalFare: z.number().int().min(MIN_FARE).max(MAX_FARE).optional(),
    note: text(1, 300).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to change.");
export type EditRide = z.infer<typeof editRideSchema>;

export const rideRequestSchema = z.object({
  message: text(1, 300).optional(),
});

export const cancelRideSchema = z.object({
  reason: text(3, 300),
});

export const listRidesQuerySchema = cursorQuerySchema.extend({
  fromLat: z.coerce.number().pipe(latitudeSchema).optional(),
  fromLng: z.coerce.number().pipe(longitudeSchema).optional(),
  toLat: z.coerce.number().pipe(latitudeSchema).optional(),
  toLng: z.coerce.number().pipe(longitudeSchema).optional(),
  /** Calendar day in India (YYYY-MM-DD). */
  date: z.iso.date().optional(),
  /** Minimum free seats. */
  seats: z.coerce.number().int().min(1).max(MAX_SEATS).optional(),
});
export type ListRidesQuery = z.infer<typeof listRidesQuerySchema>;

export const myRidesQuerySchema = z.object({
  role: z.enum(["created", "joined", "requests", "history"]),
});

export const requestIdParamsSchema = z.object({ id: z.uuid(), reqId: z.uuid() });

type RideStatusName = z.infer<typeof RideStatus.schema>;
type RequestStatusName = z.infer<typeof RideRequestStatus.schema>;

export interface RideHostDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  completedRides: number;
}

export interface RideCardDto {
  id: string;
  sourceText: string;
  destText: string;
  departureAt: string;
  status: RideStatusName;
  seatsTotal: number;
  seatsLeft: number;
  estimatedTotalFare: number;
  /** Server-computed: fare / (accepted riders + the host). */
  perPersonFare: number;
  /** Null for guests: names and photos are for signed-in members only. */
  host: RideHostDto | null;
  isMine: boolean;
  /** The viewer's own request, if any. */
  myRequest: RequestStatusName | null;
  /** The viewer is an accepted rider on this ride. */
  joined: boolean;
}

export interface RideMemberDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Only ever present for the host and accepted riders of the same ride. */
  phone: string | null;
  role: "host" | "rider";
}

export interface RideRequestDto {
  id: string;
  status: RequestStatusName;
  message: string | null;
  createdAt: string;
  rider: { userId: string; displayName: string; avatarUrl: string | null };
}

export interface RideDetailDto extends RideCardDto {
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
  note: string | null;
  cancelReason: string | null;
  version: number;
  /** Host and accepted riders only. Empty for everyone else. */
  members: RideMemberDto[];
  /** Host only: number of pending requests (full list at GET /rides/:id/requests). */
  pendingRequests: number;
  canEdit: boolean;
  canRequest: boolean;
}
