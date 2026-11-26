// SafeRoute helpers shared by the list, wizard, detail and "my reports" screens.
import type {
  CompareRoutesInput,
  CompareRoutesResponseDto,
  ReportCardDto,
  ReportCategory,
  ReportStatus,
} from "@saferstreets/shared";
import { api } from "@/lib/api";
import type { IconName } from "@/design/icons";
import type { StatusName } from "@/components/ui";

export const CATEGORY_META: Record<ReportCategory, { label: string; icon: IconName }> = {
  BROKEN_STREETLIGHT: { label: "Broken streetlight", icon: "streetlight" },
  POOR_LIGHTING: { label: "Poor lighting", icon: "poorLighting" },
  POTHOLE: { label: "Pothole", icon: "pothole" },
  DAMAGED_ROAD: { label: "Damaged road", icon: "damagedRoad" },
  DAMAGED_FOOTPATH: { label: "Footpath", icon: "footpath" },
  ISOLATED_AREA: { label: "Isolated area", icon: "isolatedArea" },
  OTHER: { label: "Other", icon: "alert" },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as ReportCategory[];

export const STATUS_NAME: Record<ReportStatus, StatusName> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  VERIFIED: "Verified",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

/** Moderator transitions (appendix-02 2A); the API enforces the same table. */
export const NEXT_STATUSES: Record<ReportStatus, ReportStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["VERIFIED"],
  REJECTED: [],
};

/** Action wording for the moderator dropdown. */
export const STATUS_ACTION: Record<ReportStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Move to under review",
  VERIFIED: "Verify",
  IN_PROGRESS: "Mark in progress",
  RESOLVED: "Mark resolved",
  REJECTED: "Reject",
};

export function categoryLabel(value: string): string {
  return CATEGORY_META[value as ReportCategory]?.label ?? "Other";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDistanceKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function peopleConfirmed(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"} confirmed`;
}

export function reportMeta(r: ReportCardDto): string {
  const parts = [categoryLabel(r.category)];
  if (r.distanceKm !== undefined) parts.push(formatDistanceKm(r.distanceKm));
  else if (r.addressText) parts.push(r.addressText);
  parts.push(formatDate(r.createdAt));
  return parts.join(" · ");
}

export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export async function compareRoutes(input: CompareRoutesInput): Promise<CompareRoutesResponseDto> {
  const res = await api<{ data: CompareRoutesResponseDto }>("/saferoute/routes", { method: "POST", body: input });
  return res.data;
}

export const DRAFT_JOURNEY_KEY = "saferstreets:draft-journey";

export interface DraftJourneyPayload {
  destinationText: string;
  destLat: number;
  destLng: number;
  startText?: string;
  startLat?: number;
  startLng?: number;
  routeGeometry?: Array<[number, number]>;
}
