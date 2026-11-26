"use client";

// Dashboard (A5.2). Each card is its own query with its own skeleton, empty and error state.
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { NightMap } from "@/components/brand/NightMap";
import {
  Button,
  Card,
  ErrorState,
  Icon,
  IconBubble,
  IconButton,
  ProgressBar,
  Skeleton,
  StatusChip,
  cn,
  type StatusName,
} from "@/components/ui";
import type { IconName } from "@/design/icons";
import { SosControl } from "./SosControl";
import {
  formatTime,
  formatWhen,
  greetingFor,
  useAlerts,
  useJourney,
  useReports,
  useRides,
  useSetup,
  type SetupData,
} from "./data";
import { useActiveJourney } from "@/components/journeyguard/hooks";

/** The "Set your alert area" step arrives with SafeAlert (Prompt 9); it is not offered before it can work. */
export const ALERT_AREA_AVAILABLE = false;

const REPORT_STATUS: Record<string, StatusName> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  VERIFIED: "Verified",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

const REPORT_ICON: Record<string, IconName> = {
  BROKEN_STREETLIGHT: "streetlight",
  POOR_LIGHTING: "poorLighting",
  POTHOLE: "pothole",
  DAMAGED_ROAD: "damagedRoad",
  DAMAGED_FOOTPATH: "footpath",
  ISOLATED_AREA: "isolatedArea",
  OTHER: "alert",
};

/** Supporting line under the greeting, driven by real setup state (A5.2). */
export function setupLine(s: SetupData): { text: string; done: number; total: number } {
  const steps = [s.contactCount > 0, ...(ALERT_AREA_AVAILABLE ? [s.alertArea !== null] : [])];
  const done = steps.filter(Boolean).length;
  if (done === steps.length) {
    const n = s.contactCount;
    const contacts = `${n} trusted ${n === 1 ? "contact" : "contacts"}`;
    return {
      text: s.alertArea
        ? `You're covered. ${contacts}, alerts on within ${s.alertArea.radiusKm} km.`
        : `You're covered. ${contacts}.`,
      done,
      total: steps.length,
    };
  }
  return { text: "Finish setting up: add a trusted contact.", done, total: steps.length };
}

export function DashboardView() {
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <Greeting />
      <SosControl />
      <ActiveJourneyBanner />
      <QuickActions />
      <Checklist />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <JourneyCard />
        <AlertsCard />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RideCard />
        <ReportsCard />
      </div>
    </div>
  );
}

function Greeting() {
  const q = useSetup();
  return (
    <section aria-label="Welcome" className="grid overflow-hidden rounded-panel bg-ink md:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-3 p-6">
        {q.isPending ? (
          <>
            <Skeleton className="h-7 w-2/3 opacity-30" />
            <Skeleton className="h-5 w-full opacity-30" />
          </>
        ) : q.isError ? (
          <>
            <h1 className="type-h2 text-white">{greetingFor()}</h1>
            <p className="text-[14px] leading-5 text-ink-muted-on-dark">We couldn&apos;t check your setup just now.</p>
          </>
        ) : (
          <>
            <h1 className="type-h2 text-white">
              {greetingFor()}
              {q.data.firstName ? `, ${q.data.firstName}` : ""}
            </h1>
            <p className="text-[14px] leading-5 text-ink-muted-on-dark" data-testid="setup-line">
              {setupLine(q.data).text}
            </p>
            {setupLine(q.data).done < setupLine(q.data).total ? (
              <div className="flex items-center gap-3">
                <div className="h-1 w-24 overflow-hidden rounded-[2px] bg-ink-border">
                  <div
                    className="h-full bg-amber"
                    style={{ width: `${(setupLine(q.data).done / setupLine(q.data).total) * 100}%` }}
                  />
                </div>
                <span className="text-[12px] leading-4 text-ink-muted-on-dark">
                  {setupLine(q.data).done} of {setupLine(q.data).total} done
                </span>
              </div>
            ) : null}
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          <Button asChild variant="amber">
            <Link href="/saferoute">Find safe route</Link>
          </Button>
          <Button asChild variant="ghost-on-dark">
            <Link href="/journeyguard/new">Start a journey</Link>
          </Button>
        </div>
      </div>
      <div className="relative hidden min-h-[200px] md:block" aria-hidden="true">
        <div className="absolute inset-0">
          <NightMap />
        </div>
      </div>
    </section>
  );
}

const ACTIONS: Array<{ href: string; label: string; icon: IconName; tone: "amber" | "mint" | "periwinkle" | "coral" }> =
  [
    { href: "/saferoute", label: "Find safe route", icon: "saferoute", tone: "amber" },
    { href: "/journeyguard/new", label: "Start journey", icon: "journeyguard", tone: "periwinkle" },
    { href: "/saferoute/new", label: "Report an issue", icon: "saferoute", tone: "mint" },
    { href: "/safealert/new", label: "Raise alert", icon: "safealert", tone: "coral" },
  ];

/** Prominent banner shown ONLY when a live tracking journey is active. */
function ActiveJourneyBanner() {
  const q = useActiveJourney();
  const j = q.data;
  if (!j || !j.trackingEnabled || (j.status !== "ACTIVE" && j.status !== "OVERDUE")) return null;
  const isAlert = j.safetyState === "SOS" || j.safetyState === "LOST_SIGNAL";
  const isWarn = j.safetyState === "DEVIATED" || j.safetyState === "STOPPED";
  const bannerBorder: "periwinkle-border" | "amber-warn-border" = isAlert || isWarn ? "amber-warn-border" : "periwinkle-border";
  const iconBg = isAlert
    ? "bg-coral-tint text-coral-text"
    : isWarn
      ? "bg-amber-tint text-amber-text"
      : "bg-periwinkle-tint text-periwinkle-text";
  const iconName: IconName = j.safetyState === "SOS" ? "emergency" : j.safetyState !== "NORMAL" ? "alert" : "journeyguard";
  const statusLabel =
    j.safetyState === "SOS" ? "SOS Active" :
    j.safetyState === "DEVIATED" ? "Off route" :
    j.safetyState === "STOPPED" ? "Extended stop" :
    j.safetyState === "LOST_SIGNAL" ? "Signal lost" :
    j.status === "OVERDUE" ? "Overdue" : "Live tracking on";
  return (
    <Card
      as={Link}
      href={`/journeyguard/${j.id}`}
      interactive
      border={bannerBorder}
      aria-label="Active journey — tap to open"
      className="flex items-center gap-4"
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-avatar", iconBg)}>
        <Icon name={iconName} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-4 font-semibold text-ink">
          {statusLabel} · To {j.destinationText}
        </p>
        <p className="text-[12px] leading-4 text-text-secondary">GPS monitoring active · tap to manage</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-text-muted" />
    </Card>
  );
}

function QuickActions() {  return (
    <ul aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ACTIONS.map((a) => (
        <li key={a.href}>
          <Card as={Link} href={a.href} interactive className="flex h-full items-center gap-3 p-4">
            <IconBubble icon={a.icon} tone={a.tone} />
            <span className="text-[14px] leading-5 font-medium">{a.label}</span>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** New-user checklist: visible until every available step is done. */
function Checklist() {
  const q = useSetup();
  if (!q.data) return null;
  const items = [
    { key: "contact", label: "Add a trusted contact", href: "/journeyguard/contacts", done: q.data.contactCount > 0 },
    ...(ALERT_AREA_AVAILABLE
      ? [{ key: "area", label: "Set your alert area", href: "/settings", done: q.data.alertArea !== null }]
      : []),
  ];
  if (items.every((i) => i.done)) return null;
  return (
    <Card as="section" aria-labelledby="checklist-h" className="flex flex-col gap-2">
      <h2 id="checklist-h" className="type-h3">
        Finish setting up
      </h2>
      <ul className="flex flex-col">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="flex min-h-11 items-center gap-3 text-[14px] leading-5">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-avatar border",
                  i.done ? "border-mint bg-mint-tint text-mint-text" : "border-line-control bg-card text-transparent",
                )}
                aria-hidden="true"
              >
                <Icon name="check" size={14} />
              </span>
              <span className={cn("font-medium", i.done && "text-text-secondary line-through")}>{i.label}</span>
              <span className="sr-only">{i.done ? "Done" : "To do"}</span>
              {!i.done ? <Icon name="chevronRight" size={16} className="ml-auto text-text-muted" /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-1/2" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function CardFrame({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  return (
    <Card as="section" className="flex flex-col gap-3" {...rest}>
      {children}
    </Card>
  );
}

function JourneyCard() {
  const q = useJourney();
  if (q.isPending)
    return (
      <CardFrame aria-label="Journey">
        <CardSkeleton rows={2} />
      </CardFrame>
    );
  if (q.isError)
    return (
      <CardFrame aria-label="Journey">
        <ErrorState title="We couldn't load your journey" onRetry={() => void q.refetch()} />
      </CardFrame>
    );
  const j = q.data;
  if (!j) {
    return (
      <CardFrame aria-label="Journey">
        <h2 className="type-h3">Heading out? Let someone know.</h2>
        <p className="text-[14px] leading-5 text-text-secondary">
          Tell a trusted contact where you&apos;re going and when you&apos;ll arrive.
        </p>
        <div>
          <Button asChild>
            <Link href="/journeyguard/new">Start a journey</Link>
          </Button>
        </div>
      </CardFrame>
    );
  }
  const overdue = j.status === "OVERDUE";
  return (
    <Card as="section" aria-label="Journey" border="periwinkle-border" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {overdue ? (
          <StatusChip tone="coral" label="Are you safe?" icon="alert" />
        ) : (
          <StatusChip status="Active journey" icon="journeyguard" />
        )}
        <span className="text-[12px] leading-4 text-text-secondary">Arrive by {formatTime(j.expectedArrivalAt)}</span>
      </div>
      <h2 className="type-h3">{j.startText ? `${j.startText} to ${j.destinationText}` : `To ${j.destinationText}`}</h2>
      <ProgressBar value={j.progressPct} label="Journey progress" />
      <p className="text-[14px] leading-5 text-text-secondary">
        {overdue ? "Past your arrival time. " : `${j.minutesLeft} min left. `}
        {j.contactName ? `${j.contactName} is emailed if you're late.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/journeyguard/${j.id}`}>I&apos;ve arrived safely</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/journeyguard/${j.id}`}>Extend ETA</Link>
        </Button>
      </div>
    </Card>
  );
}

/** Calm, dismissible, optional: points to Settings > Safety alerts. */
function AlertOptIn() {
  const [dismissed, setDismissed] = useState(false);
  const stored = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem("ss_alert_optin_dismissed") === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const hidden = dismissed || stored;
  if (hidden) return null;
  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-banner border border-line bg-neutral-chip p-3"
      data-testid="alert-optin"
    >
      <Icon name="safealert" size={20} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5 font-medium">Get Unverified alerts near you</p>
        <p className="text-[12px] leading-4 text-text-secondary">Optional. Choose an area and the kinds of alerts.</p>
        <Link
          href="/settings#alerts"
          className="inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          Set your alert area
        </Link>
      </div>
      <IconButton
        icon="close"
        label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem("ss_alert_optin_dismissed", "1");
          } catch {
            /* storage unavailable */
          }
        }}
      />
    </div>
  );
}

function AlertsCard() {
  const q = useAlerts();
  return (
    <CardFrame aria-label="Nearby alerts">
      <div className="flex items-center justify-between">
        <h2 className="type-h3">Nearby alerts</h2>
        <Link
          href="/safealert"
          className="inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          View all
        </Link>
      </div>
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState title="We couldn't load alerts" onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <p className="py-4 text-[14px] leading-5 text-text-secondary">All quiet around you.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <IconBubble icon="alert" variant="tint" tone="coral" size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] leading-5 font-medium">{a.title}</p>
                <p className="text-[12px] leading-4 text-text-secondary">
                  {a.addressText} · {a.distanceKm} km · {a.minutesAgo} min
                </p>
              </div>
              <StatusChip status={a.status === "VERIFIED" ? "Verified" : "Unverified"} />
            </li>
          ))}
        </ul>
      )}
      {q.data && !q.data.hasArea ? <AlertOptIn /> : null}
    </CardFrame>
  );
}

function RideCard() {
  const q = useRides();
  if (q.isPending)
    return (
      <CardFrame aria-label="Upcoming ride">
        <CardSkeleton rows={1} />
      </CardFrame>
    );
  if (q.isError)
    return (
      <CardFrame aria-label="Upcoming ride">
        <ErrorState title="We couldn't load your ride" onRetry={() => void q.refetch()} />
      </CardFrame>
    );
  const r = q.data;
  if (!r) {
    return (
      <CardFrame aria-label="Upcoming ride">
        <h2 className="type-h3">Upcoming ride</h2>
        <p className="text-[14px] leading-5 text-text-secondary">
          No rides coming up. Offer one or find one heading your way.
        </p>
        <div>
          <Button asChild variant="secondary">
            <Link href="/automate">Find a ride</Link>
          </Button>
        </div>
      </CardFrame>
    );
  }
  const others = r.othersCount;
  return (
    <Card
      as={Link}
      href={`/automate/${r.id}`}
      interactive
      aria-label="Upcoming ride"
      className="flex items-center gap-3"
    >
      <IconBubble icon="automate" tone="mint" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-5 font-semibold">
          {r.sourceText} to {r.destText}, {formatWhen(r.departureAt)}
        </p>
        <p className="text-[12px] leading-4 text-text-secondary">
          {others === 0 ? "Just you so far" : `You and ${others} ${others === 1 ? "other" : "others"}`} · about ₹
          {r.perPersonFare} each
        </p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-text-muted" />
    </Card>
  );
}

function ReportsCard() {
  const q = useReports();
  return (
    <CardFrame aria-label="My recent reports">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-h3">My recent reports</h2>
        {q.data ? <span className="text-[12px] leading-4 text-text-secondary">{q.data.thisWeek} this week</span> : null}
      </div>
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState title="We couldn't load your reports" onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[14px] leading-5 text-text-secondary">Be the first to report an issue nearby.</p>
          <Button asChild variant="secondary">
            <Link href="/saferoute/new">Report an issue</Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <IconBubble icon={REPORT_ICON[r.category] ?? "alert"} tone="amber" variant="tint" size={28} />
              <Link href={`/saferoute/${r.id}`} className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium">
                {r.title}
              </Link>
              <StatusChip status={REPORT_STATUS[r.status] ?? "Submitted"} />
            </li>
          ))}
        </ul>
      )}
    </CardFrame>
  );
}
