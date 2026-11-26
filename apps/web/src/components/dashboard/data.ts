"use client";

// Types and query hooks for the six dashboard endpoints (one per card, each loads and fails alone).
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SetupData {
  firstName: string | null;
  contactCount: number;
  alertArea: { radiusKm: number } | null;
}
export interface JourneyData {
  id: string;
  status: "ACTIVE" | "OVERDUE";
  startText: string | null;
  destinationText: string;
  expectedArrivalAt: string;
  minutesLeft: number;
  progressPct: number;
  contactName: string | null;
  contactNotified: boolean;
}
export interface AlertsData {
  hasArea: boolean;
  items: Array<{
    id: string;
    title: string;
    addressText: string;
    distanceKm: number;
    minutesAgo: number;
    status: "ACTIVE" | "VERIFIED";
  }>;
}
export interface RideData {
  id: string;
  sourceText: string;
  destText: string;
  departureAt: string;
  othersCount: number;
  perPersonFare: number;
  isCreator: boolean;
}
export interface ReportsData {
  thisWeek: number;
  items: Array<{ id: string; title: string; status: string; category: string; createdAt: string }>;
}

function useCard<T>(name: string) {
  return useQuery({
    queryKey: ["dashboard", name],
    queryFn: () => api<{ data: T }>(`/me/dashboard/${name}`).then((r) => r.data),
    // Cards stay fresh without a full reload.
    refetchInterval: 60_000,
  });
}

export const useSetup = () => useCard<SetupData>("setup");
export const useJourney = () => useCard<JourneyData | null>("journey");
export const useAlerts = () => useCard<AlertsData>("alerts");
export const useRides = () => useCard<RideData | null>("rides");
export const useReports = () => useCard<ReportsData>("reports");

const time = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});
const day = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const hourOnly = new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });

/** "6:45 pm" (lower-case am/pm, IST). */
export function formatTime(iso: string): string {
  return time.format(new Date(iso)).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
}

/** "8:15 pm" for today (A5.2 shows just the time), "Tomorrow, 8:15 pm" or "Sat 29 Nov, 8:15 pm" otherwise. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = (a: Date, b: Date) => day.format(a) === day.format(b);
  if (sameDay(d, now)) return formatTime(iso);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const label = sameDay(d, tomorrow) ? "Tomorrow" : day.format(d).replace(",", "");
  return `${label}, ${formatTime(iso)}`;
}

export function greetingFor(now = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const h = Number(hourOnly.format(now)) % 24;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
