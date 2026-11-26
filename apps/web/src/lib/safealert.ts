// SafeAlert helpers shared by the feed, the post form and the detail screen.
import type { AlertCategory } from "@saferstreets/shared";
import type { IconName } from "@/design/icons";

export const ALERT_CATEGORY_META: Record<AlertCategory, { label: string; icon: IconName }> = {
  ROAD_ACCIDENT: { label: "Road accident", icon: "automate" },
  MEDICAL: { label: "Medical", icon: "medical" },
  HARASSMENT: { label: "Harassment", icon: "harassment" },
  FIRE: { label: "Fire", icon: "fire" },
  PUBLIC_HAZARD: { label: "Public hazard", icon: "alert" },
  OTHER: { label: "Other", icon: "safealert" },
};

export const ALERT_CATEGORY_ORDER = Object.keys(ALERT_CATEGORY_META) as AlertCategory[];

export function alertCategoryLabel(value: string): string {
  return ALERT_CATEGORY_META[value as AlertCategory]?.label ?? "Other";
}

/** "5 min ago", "2 h ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** "Expires in 4 h 10 min". */
export function expiresIn(iso: string, now = Date.now()): string {
  const mins = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (mins <= 0) return "Expiring now";
  if (mins < 60) return `Expires in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `Expires in ${h} h ${m} min` : `Expires in ${h} h`;
}

export const CALL_112_LINE = "If anyone is in danger, call 112.";
export const HONEST_LINE =
  "Alerts are shown to nearby opted-in people as Unverified. We do not contact police or emergency services.";
