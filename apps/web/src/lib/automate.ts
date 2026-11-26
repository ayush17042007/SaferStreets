// AutoMate helpers shared by browse, create, detail and "my rides" screens.
import type { RideCardDto } from "@saferstreets/shared";
import type { StatusName } from "@/components/ui";

export type RideStatusValue = RideCardDto["status"];

/** Status chip text for a ride. Always rendered as text, never colour alone. */
export const RIDE_STATUS_NAME: Record<RideStatusValue, StatusName> = {
  OPEN: "Open",
  FULL: "Full",
  IN_PROGRESS: "In progress",
  COMPLETED: "Resolved",
  CANCELLED: "Cancelled",
};

export const RIDE_STATUS_LABEL: Record<RideStatusValue, string> = {
  OPEN: "Open",
  FULL: "Full",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60_000;

/** "Tue, 3 Dec, 6:30 pm" in India time. */
export function formatRideTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatRupees(n: number): string {
  return `\u20B9${n.toLocaleString("en-IN")}`;
}

/** Per-person fare preview: total split between riders and the host, rounded up. */
export function perPersonPreview(totalFare: number, seats: number): number {
  if (!Number.isFinite(totalFare) || !Number.isFinite(seats) || seats < 1) return 0;
  return Math.ceil(totalFare / (seats + 1));
}

/** Value for a datetime-local input, shifted to India time. */
export function istInputValue(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** A datetime-local value is read as India time. */
export function istInputToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

export function isoToIstInput(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

export function seatsLabel(left: number): string {
  return `${left} ${left === 1 ? "seat" : "seats"} left`;
}

export function routeLabel(r: { sourceText: string; destText: string }): string {
  return `${r.sourceText} to ${r.destText}`;
}

export function newKey(): string {
  return globalThis.crypto.randomUUID();
}
