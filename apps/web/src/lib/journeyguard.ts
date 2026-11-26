// JourneyGuard helpers: India-time formatting, datetime-local conversion, and live tracking APIs.
import type { JourneyDto, LocationUpdateInput } from "@saferstreets/shared";
import { api } from "@/lib/api";

const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60_000;

/** "6:30 pm", with the day ("Tue, 3 Dec") added when it is not today in India time. */
export function formatClock(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const day = (t: Date) => t.toLocaleDateString("en-IN", { timeZone: IST });
  const time = d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
  if (day(d) === day(new Date(now))) return time;
  const date = d.toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
  return `${date}, ${time}`;
}

/** "Tue, 3 Dec, 6:30 pm" in India time. */
export function formatDateTime(iso: string): string {
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

/** Value for a datetime-local input, shifted to India time. */
export function istInputValue(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** A datetime-local value is read as India time. */
export function istInputToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

export function newKey(): string {
  return globalThis.crypto.randomUUID();
}

export async function recordJourneyLocation(id: string, input: LocationUpdateInput): Promise<JourneyDto> {
  const res = await api<{ data: JourneyDto }>(`/journeys/${id}/location`, { method: "POST", body: input });
  return res.data;
}

export async function triggerJourneySos(
  id: string,
): Promise<{ ok: true; emergencyNumber: "112"; journey: JourneyDto }> {
  const res = await api<{ data: { ok: true; emergencyNumber: "112"; journey: JourneyDto } }>(`/journeys/${id}/sos`, {
    method: "POST",
  });
  return res.data;
}
