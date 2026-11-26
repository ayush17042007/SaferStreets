import type { IconName } from "@/design/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Stay highlighted on every page under href. */
  prefix?: boolean;
}

/** Sidebar items (A5.2, appendix-04 4.2). */
export const appNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/saferoute", label: "SafeRoute", icon: "saferoute" },
  { href: "/automate", label: "AutoMate", icon: "automate" },
  { href: "/journeyguard", label: "JourneyGuard", icon: "journeyguard" },
  { href: "/safealert", label: "SafeAlert", icon: "safealert" },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
];

/** Shown only to moderators and admins. */
export const staffNavItem: NavItem = { href: "/admin", label: "Admin", icon: "logo", prefix: true };

/** Mobile bottom tab bar: Home, Routes, Rides, Journey, Alerts (A4, A5.7). */
export const tabNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/saferoute", label: "Routes", icon: "saferoute" },
  { href: "/automate", label: "Rides", icon: "automate" },
  { href: "/journeyguard", label: "Journey", icon: "journeyguard" },
  { href: "/safealert", label: "Alerts", icon: "safealert" },
];

/** Admin layout (A5.10, appendix-04 4.2). */
export const adminNav: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "dashboard" },
  { href: "/admin/queue", label: "Moderation", icon: "verified" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/flags", label: "Flags", icon: "flag" },
  { href: "/admin/audit", label: "Audit log", icon: "history" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export function isActive(href: string, current: string, exact = false): boolean {
  if (exact || href === "/admin") return current === href;
  return current === href || current.startsWith(`${href}/`);
}
