import type { ColorToken } from "@/design/tokens";
import type { IconName } from "@/design/icons";
import { Icon } from "./Icon";
import { cn } from "./cn";

/**
 * A2 "Status chip mapping" as typed variants. Status is never colour alone: the label text is
 * always rendered, an icon is optional.
 */
export const chipVariants = {
  neutral: { cls: "bg-neutral-chip text-text-secondary", bg: "neutral-chip", fg: "text-secondary" },
  amber: { cls: "bg-amber-tint text-amber-text", bg: "amber-tint", fg: "amber-text" },
  mint: { cls: "bg-mint-tint text-mint-text", bg: "mint-tint", fg: "mint-text" },
  periwinkle: { cls: "bg-periwinkle-tint text-periwinkle-text", bg: "periwinkle-tint", fg: "periwinkle-text" },
  coral: { cls: "bg-coral-tint text-coral-text", bg: "coral-tint", fg: "coral-text" },
} as const satisfies Record<string, { cls: string; bg: ColorToken; fg: ColorToken }>;

export type ChipTone = keyof typeof chipVariants;

/** Named statuses from the A2 table, each mapped to a tone. */
export const statusTone = {
  Submitted: "neutral",
  Full: "neutral",
  Cancelled: "neutral",
  "Under review": "amber",
  Unverified: "amber",
  Verified: "mint",
  Resolved: "mint",
  Open: "mint",
  Accepted: "mint",
  "In progress": "periwinkle",
  "Active journey": "periwinkle",
  Rejected: "coral",
  Overdue: "coral",
  Dismissed: "coral",
  "Are you safe?": "coral",
} as const satisfies Record<string, ChipTone>;

export type StatusName = keyof typeof statusTone;

export interface StatusChipProps {
  /** Either a named status from the A2 table, or a tone plus your own label. */
  status?: StatusName;
  tone?: ChipTone;
  label?: string;
  icon?: IconName;
  className?: string;
}

/** Height 24, padding 0 10, radius 999, 12 px / weight 500, optional 14 px leading icon. */
export function StatusChip({ status, tone, label, icon, className }: StatusChipProps) {
  const t = tone ?? (status ? statusTone[status] : "neutral");
  const text = label ?? status ?? "";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-chip px-2.5 text-[12px] leading-4 font-medium whitespace-nowrap",
        chipVariants[t].cls,
        className,
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {text}
    </span>
  );
}
