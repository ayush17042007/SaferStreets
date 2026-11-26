"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Avatar, Icon, IconButton, cn, type EmergencyNumber } from "@/components/ui";
import { SosBanner } from "@/components/sos/SosBanner";
import { EmergencyMenu } from "./EmergencyMenu";
import { useHasUnread } from "./hooks";
import { UserMenu, type ShellUser } from "./UserMenu";
import { adminNav, appNav, isActive, staffNavItem, tabNav, type NavItem } from "./nav";

export interface AppShellProps {
  variant?: "app" | "admin";
  user: ShellUser;
  /** Moderators and admins get an Admin item in the sidebar. */
  staff?: boolean;
  /** Shows the small amber dot on the bell. */
  unread?: boolean;
  /** Overrides the router path (used by /dev/shell to show any active item). */
  activeHref?: string;
  /** Dev/test override; in the app the numbers come from the public API. */
  emergencyNumbers?: EmergencyNumber[];
  children: ReactNode;
}

/**
 * Desktop (>= 1024): 240 px white sidebar + 64 px cream top bar.
 * Tablet (768-1023): icon-only 64 px sidebar. Mobile (< 768): top bar + bottom tab bar.
 */
export function AppShell({
  variant = "app",
  user,
  staff,
  unread,
  activeHref,
  emergencyNumbers,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const current = activeHref ?? pathname;
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const nav = variant === "admin" ? adminNav : staff ? [...appNav, staffNavItem] : appNav;
  const hasUnread = useHasUnread(unread);

  return (
    <div className="min-h-screen bg-cream">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar items={nav} current={current} user={user} variant={variant} />

      <div className="md:pl-16 lg:pl-60">
        <DesktopTopBar
          user={user}
          unread={hasUnread}
          onEmergency={() => setEmergencyOpen((o) => !o)}
          open={emergencyOpen}
          setOpen={setEmergencyOpen}
          numbers={emergencyNumbers}
        />
        <MobileTopBar user={user} unread={hasUnread} onEmergency={() => setEmergencyOpen(true)} />
        <main
          id="main"
          className="mx-auto max-w-[1200px] px-4 pt-4 pb-[calc(80px+env(safe-area-inset-bottom))] md:px-6 md:pb-8 lg:px-8"
        >
          <SosBanner />
          {children}
        </main>
      </div>

      {variant === "app" ? <TabBar current={current} /> : null}
      <EmergencyMenu
        surface="sheet"
        open={emergencyOpen}
        onOpenChange={setEmergencyOpen}
        {...(emergencyNumbers ? { numbers: emergencyNumbers } : {})}
      />
    </div>
  );
}

function Sidebar({
  items,
  current,
  user,
  variant,
}: {
  items: NavItem[];
  current: string;
  user: ShellUser;
  variant: "app" | "admin";
}) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-card md:flex lg:w-60"
      aria-label={variant === "admin" ? "Admin" : "Primary"}
    >
      <div className="flex h-16 items-center justify-center px-4 lg:justify-start">
        <Link
          href={variant === "admin" ? "/admin" : "/dashboard"}
          aria-label="SaferStreets home"
          className="rounded-control"
        >
          <span className="lg:hidden">
            <LogoMark />
          </span>
          <span className="hidden lg:inline-flex">
            <Logo />
          </span>
        </Link>
      </div>
      {variant === "admin" ? (
        <p className="hidden px-4 pb-1 text-[12px] leading-4 font-medium text-text-secondary lg:block">
          Moderation and admin
        </p>
      ) : null}
      <nav
        aria-label={variant === "admin" ? "Admin sections" : "Sections"}
        className="flex flex-1 flex-col gap-1 px-2 py-2 lg:px-3"
      >
        {items.map((it) => {
          const active = isActive(it.href, current) || (it.prefix === true && current.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              title={it.label}
              className={cn(
                "flex h-11 items-center justify-center gap-3 rounded-control-sm px-3 text-[14px] leading-5 transition-colors duration-fast lg:h-10 lg:justify-start",
                active ? "bg-ink font-semibold text-white" : "text-text-secondary hover:bg-neutral-bubble",
              )}
            >
              <Icon name={it.icon} size={20} className={active ? "text-amber" : undefined} />
              <span className="sr-only lg:not-sr-only">{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <Link
          href="/profile"
          className="flex min-h-11 items-center justify-center gap-3 rounded-control-sm p-1 hover:bg-neutral-bubble lg:justify-start"
        >
          <Avatar name={user.name} size={32} imageUrl={user.avatarUrl ?? null} />
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-[14px] leading-5 font-medium">{user.name}</span>
            <span className="block text-[12px] leading-4 text-text-secondary">Profile</span>
          </span>
          <span className="sr-only lg:hidden">Profile: {user.name}</span>
        </Link>
      </div>
    </aside>
  );
}

function DesktopTopBar({
  user,
  unread,
  onEmergency,
  open,
  setOpen,
  numbers,
}: {
  user: ShellUser;
  unread: boolean | undefined;
  onEmergency: () => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  numbers: EmergencyNumber[] | undefined;
}) {
  void onEmergency;
  return (
    <header className="hidden h-16 items-center gap-4 bg-cream px-6 md:flex lg:px-8">
      <form role="search" className="relative w-full max-w-[360px]" onSubmit={(e) => e.preventDefault()}>
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
        />
        <input
          type="search"
          aria-label="Search reports, rides, places"
          placeholder="Search reports, rides, places"
          className="h-11 w-full rounded-control border border-line bg-card pr-3 pl-10 text-[14px] leading-5 text-ink placeholder:text-text-muted"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <EmergencyMenu surface="popover" open={open} onOpenChange={setOpen} trigger {...(numbers ? { numbers } : {})} />
        <BellLink unread={!!unread} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

function MobileTopBar({
  user,
  unread,
  onEmergency,
}: {
  user: ShellUser;
  unread: boolean | undefined;
  onEmergency: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-cream px-4 md:hidden">
      <Link href="/dashboard" aria-label="SaferStreets home" className="rounded-logo">
        <LogoMark />
      </Link>
      <div className="flex items-center gap-1">
        <IconButton icon="emergency" label="Emergency numbers" onClick={onEmergency} className="text-coral-text" />
        <BellLink unread={!!unread} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

/** Active tab: ink text, weight 600, and a 3 x 16 amber bar above the icon (A4). */
function TabBar({ current }: { current: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {tabNav.map((t) => {
          const active = isActive(t.href, current);
          return (
            <li key={t.href} className="relative">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[12px] leading-4",
                  active ? "font-semibold text-ink" : "text-text-secondary",
                )}
              >
                {active ? (
                  <span className="absolute top-0 h-[3px] w-4 rounded-chip bg-amber" aria-hidden="true" />
                ) : null}
                <Icon name={t.icon} size={20} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bell link to /notifications with the small amber dot for unread (A4 top bar). */
function BellLink({ unread }: { unread: boolean }) {
  return (
    <Link
      href="/notifications"
      aria-label={unread ? "Notifications, unread" : "Notifications"}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-control text-ink transition-colors duration-fast ease-out hover:bg-neutral-bubble"
    >
      <Icon name="notifications" size={20} />
      {unread ? (
        <span
          className="absolute top-2.5 right-2.5 h-2 w-2 rounded-chip bg-amber ring-2 ring-cream"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}
