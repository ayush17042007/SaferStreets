// Illustrated empty states (A3): lamp dots + route line + rounded map block; ink and amber on cream.
import { cn } from "@/components/ui/cn";

export type EmptyArtKind = "quiet" | "reports" | "rides";

const common = "block h-[96px] w-[140px]";

export function EmptyArt({ kind, className }: { kind: EmptyArtKind; className?: string }) {
  return (
    <svg viewBox="0 0 140 96" className={cn(common, className)} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="14" width="124" height="68" rx="16" className="fill-ink" />
      {kind === "quiet" && (
        <g>
          <rect x="20" y="26" width="40" height="20" rx="8" className="fill-ink-soft" />
          <rect x="80" y="52" width="40" height="20" rx="8" className="fill-ink-soft" />
          <path d="M16 48 H124" className="stroke-ink-road" strokeWidth="6" strokeLinecap="round" />
          {[30, 54, 78, 102].map((x) => (
            <g key={x} className="fill-amber">
              <circle cx={x} cy="48" r="11" opacity="0.16" />
              <circle cx={x} cy="48" r="3" />
            </g>
          ))}
        </g>
      )}
      {kind === "reports" && (
        <g>
          <rect x="22" y="26" width="34" height="46" rx="8" className="fill-ink-soft" />
          <path
            d="M70 70 V44 H112"
            className="stroke-ink-road"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="90" cy="30" r="12" className="fill-amber" opacity="0.16" />
          <circle cx="90" cy="30" r="4" className="fill-amber" />
          <circle cx="112" cy="44" r="3" className="fill-amber" />
        </g>
      )}
      {kind === "rides" && (
        <g>
          <rect x="84" y="24" width="36" height="24" rx="8" className="fill-ink-soft" />
          <path
            d="M24 68 H56 V44 H96 V60 H116"
            className="stroke-mint"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="24" cy="68" r="5" className="fill-ink stroke-white" strokeWidth="2" />
          <circle cx="116" cy="60" r="5" className="fill-amber stroke-white" strokeWidth="2" />
          <circle cx="56" cy="30" r="10" className="fill-amber" opacity="0.16" />
          <circle cx="56" cy="30" r="3" className="fill-amber" />
        </g>
      )}
    </svg>
  );
}
