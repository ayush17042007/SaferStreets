// Small presentational pieces: Avatar, Badge, Skeleton, ProgressBar, Stepper, CountdownRing.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Initials avatar: amber-tint circle, amber-text initials (A3). Sizes 32 / 40. */
export function Avatar({
  name,
  size = 40,
  className,
  imageUrl,
}: {
  name: string;
  size?: 32 | 40 | 64 | 96;
  className?: string;
  /** Uploaded photo; falls back to initials when absent. */
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-avatar object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-avatar bg-amber-tint font-display font-semibold text-amber-text",
        size === 96
          ? "h-24 w-24 text-[28px]"
          : size === 64
            ? "h-16 w-16 text-[22px]"
            : size === 40
              ? "h-10 w-10 text-[14px]"
              : "h-8 w-8 text-[12px]",
        className,
      )}
      role="img"
      aria-label={name}
    >
      {initialsOf(name)}
    </span>
  );
}

export type BadgeTone = "ink" | "amber" | "mint" | "neutral";
const badgeCls: Record<BadgeTone, string> = {
  ink: "bg-ink text-white",
  amber: "bg-amber text-ink",
  mint: "bg-mint-tint text-mint-text",
  neutral: "bg-neutral-chip text-text-secondary",
};

/** Count badge (e.g. unread count). Text is ink on amber, never white on amber. */
export function Badge({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-chip px-1.5 text-[12px] leading-4 font-semibold",
        badgeCls[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Cream-tinted shape matching the final layout; never a lone spinner for page content (A4). */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton rounded-control", className)} style={style} aria-hidden="true" />;
}

/** Journey bar: 7 px high, radius 4, periwinkle on the journey track. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-[7px] w-full overflow-hidden rounded-[4px] bg-track-journey-bar"
    >
      <div
        className="h-full rounded-[4px] bg-periwinkle transition-[width] duration-sheet ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Wizard steps: four 4 px segments, radius 2, filled ink, remaining track. */
export function Stepper({ step, steps = 4, label = "Progress" }: { step: number; steps?: number; label?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={steps}
      aria-valuenow={step}
      aria-valuetext={`Step ${step} of ${steps}`}
      className="flex gap-1"
    >
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} className={cn("h-1 flex-1 rounded-[2px]", i < step ? "bg-ink" : "bg-track")} />
      ))}
    </div>
  );
}

/** Journey countdown ring: 130 px (scalable), 10 px stroke, round caps, large number centred. */
export function CountdownRing({
  minutesLeft,
  totalMinutes,
  size = 130,
  overdue = false,
}: {
  minutesLeft: number;
  totalMinutes: number;
  size?: number;
  /** Overdue: the ring turns amber (A5.5). */
  overdue?: boolean;
}) {
  const stroke = 10;
  const r = 50 - stroke / 2 + 0; // viewBox is 100, so the stroke stays 10 units at any size
  const c = 2 * Math.PI * r;
  const frac = totalMinutes > 0 ? Math.max(0, Math.min(1, minutesLeft / totalMinutes)) : 0;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${minutesLeft} minutes left`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" className="stroke-track-journey-ring" strokeWidth={stroke} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          className={overdue ? "stroke-amber" : "stroke-periwinkle"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="font-display font-semibold text-ink" style={{ fontSize: size * 0.3, lineHeight: 1 }}>
          {minutesLeft}
        </span>
        <span className="text-[12px] leading-4 text-text-secondary">min left</span>
      </div>
    </div>
  );
}
