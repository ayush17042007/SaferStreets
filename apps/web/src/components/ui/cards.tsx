// Feature cards (A4): CategoryTile, RideCard, AlertCard, ReportCard, JourneyCard, NotificationItem.
// Presentational, props only: no data fetching.
import type { ReactNode } from "react";
import type { IconName } from "@/design/icons";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { IconBubble, type BubbleTone } from "./IconBubble";
import { Avatar, ProgressBar } from "./display";
import { StatusChip, type ChipTone, type StatusName } from "./StatusChip";
import { cn } from "./cn";

/** Report step 1 tile: white card, padding 12, bubble above a weight-500 label. Selected: 1.5 px ink border, amber-tint bg, amber bubble. */
export function CategoryTile({
  icon,
  label,
  selected,
  onSelect,
}: {
  icon: IconName;
  label: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-[88px] flex-col items-start gap-2 rounded-card p-3 text-left text-[14px] leading-5 font-medium text-ink",
        "transition-[border-color,background-color] duration-fast ease-out",
        selected ? "border-[1.5px] border-ink bg-amber-tint" : "border border-line bg-card hover:border-line-control",
      )}
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-logo",
          selected ? "bg-amber text-ink" : "bg-neutral-bubble text-ink",
        )}
        aria-hidden="true"
      >
        <Icon name={icon} size={18} />
      </span>
      {label}
    </button>
  );
}

export interface RideCardProps {
  time: string;
  /** "2 seats left" or "Full". */
  seatsLabel: string;
  full?: boolean;
  hostName: string;
  hostMeta: string;
  price: string;
  onRequest?: () => void;
  requesting?: boolean;
}

/** Ride card (A4): time + seats chip, host row, price footer with a small Ink "Request to join". Full rides show no primary action. */
export function RideCard({ time, seatsLabel, full, hostName, hostMeta, price, onRequest, requesting }: RideCardProps) {
  return (
    <Card interactive={!full} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h3">{time}</h3>
        {full ? <StatusChip status="Full" /> : <StatusChip tone="mint" label={seatsLabel} />}
      </div>
      <div className="flex items-center gap-2">
        <Avatar name={hostName} size={32} />
        <div className="min-w-0 text-[14px] leading-5">
          <p className="flex items-center gap-1 font-medium">
            {hostName}
            {!full ? <Icon name="verified" size={16} className="text-mint" /> : null}
          </p>
          <p className="text-[12px] leading-4 text-text-secondary">{hostMeta}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p>
          <span className="font-display font-semibold">{price}</span>
          <span className="ml-1 text-[12px] leading-4 text-text-secondary">each, est.</span>
        </p>
        {full ? (
          <Button variant="secondary" size="sm" disabled>
            Full
          </Button>
        ) : (
          <Button size="sm" loading={requesting ?? false} {...(onRequest ? { onClick: onRequest } : {})}>
            Request to join
          </Button>
        )}
      </div>
    </Card>
  );
}

export interface AlertCardProps {
  title: string;
  /** "Station Rd · 0.6 km · 8 min" */
  meta: string;
  status: StatusName;
  /** "4 confirmed" or "Moderator checked". */
  footnote?: string;
  /** coral (emergencies) or amber (hazards). */
  tone?: "coral" | "amber";
}

/** Alert card: coral-tint icon bubble with alert-triangle (amber-tint for hazards), weight-500 title, meta line, chip, confirmations. */
export function AlertCard({ title, meta, status, footnote, tone = "coral" }: AlertCardProps) {
  return (
    <Card interactive className="flex items-center gap-3">
      <IconBubble icon="alert" variant="tint" tone={tone} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5 font-medium">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">{meta}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusChip status={status} />
        {footnote ? <span className="text-[12px] leading-4 text-text-secondary">{footnote}</span> : null}
      </div>
    </Card>
  );
}

export interface ReportCardProps {
  title: string;
  meta: string;
  icon: IconName;
  status: StatusName;
  confirmations?: number;
}

export function ReportCard({ title, meta, icon, status, confirmations }: ReportCardProps) {
  return (
    <Card interactive className="flex items-center gap-3">
      <IconBubble icon={icon} tone="amber" variant="tint" size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-5 font-medium">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">
          {meta}
          {confirmations ? ` · ${confirmations} confirmed` : ""}
        </p>
      </div>
      <StatusChip status={status} />
    </Card>
  );
}

export interface JourneyCardProps {
  title: string;
  arriveBy: string;
  progress: number;
  caption: string;
  onArrived?: () => void;
  onExtend?: () => void;
}

/** Active journey card: periwinkle-border, "Active journey" chip, title, 7 px bar, caption, Ink + Secondary buttons (A5.2). */
export function JourneyCard({ title, arriveBy, progress, caption, onArrived, onExtend }: JourneyCardProps) {
  return (
    <Card border="periwinkle-border" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <StatusChip status="Active journey" icon="journeyguard" />
        <span className="text-[12px] leading-4 text-text-secondary">Arrive by {arriveBy}</span>
      </div>
      <h3 className="type-h3">{title}</h3>
      <ProgressBar value={progress} label="Journey progress" />
      <p className="text-[14px] leading-5 text-text-secondary">{caption}</p>
      <div className="flex flex-wrap gap-2">
        <Button {...(onArrived ? { onClick: onArrived } : {})}>I&apos;ve arrived safely</Button>
        <Button variant="secondary" {...(onExtend ? { onClick: onExtend } : {})}>
          Extend ETA
        </Button>
      </div>
    </Card>
  );
}

/** Notification row: module icon bubble, text, time, chevron; unread has a 6 px amber dot (A5.8). */
export function NotificationItem({
  icon,
  tone,
  text,
  time,
  unread,
}: {
  icon: IconName;
  tone: BubbleTone;
  text: string;
  time: string;
  unread?: boolean;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-line py-3 last:border-b-0">
      <IconBubble icon={icon} tone={tone} size={28} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14px] leading-5", unread && "font-medium")}>{text}</p>
        <p className="text-[12px] leading-4 text-text-secondary">{time}</p>
      </div>
      {unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-chip bg-amber" aria-label="Unread" role="img" /> : null}
      <Icon name="chevronRight" size={16} className="shrink-0 text-text-muted" />
    </div>
  );
}

export type { ChipTone };
export type TimelineEntry = { title: string; time: string; note?: string; tone?: ChipTone };

/** Vertical status timeline (report history, journey events). */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => (
        <li key={`${e.title}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < entries.length - 1 ? (
            <span className="absolute top-4 bottom-0 left-[5px] w-px bg-line" aria-hidden="true" />
          ) : null}
          <span
            className={cn(
              "relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-avatar border-2 border-card",
              i === 0 ? "bg-ink" : "bg-track",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[14px] leading-5 font-medium">{e.title}</p>
            <p className="text-[12px] leading-4 text-text-secondary">{e.time}</p>
            {e.note ? <p className="mt-1 text-[14px] leading-5 text-text-secondary">{e.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="type-h2">{children}</h2>;
}
