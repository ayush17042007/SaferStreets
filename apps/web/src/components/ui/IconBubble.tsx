import type { ColorToken } from "@/design/tokens";
import type { IconName } from "@/design/icons";
import { Icon } from "./Icon";
import { cn } from "./cn";

export type BubbleTone = "amber" | "mint" | "periwinkle" | "coral" | "neutral";

/**
 * Solid: module colour with an ink icon (amber, mint) or white icon (periwinkle, coral).
 * Tint: tint background with matching text colour, for passive rows (A4).
 */
export const bubbleVariants = {
  solid: {
    amber: { cls: "bg-amber text-ink", bg: "amber", fg: "ink" },
    mint: { cls: "bg-mint text-ink", bg: "mint", fg: "ink" },
    periwinkle: { cls: "bg-periwinkle text-white", bg: "periwinkle", fg: "white" },
    coral: { cls: "bg-coral text-white", bg: "coral", fg: "white" },
    neutral: { cls: "bg-neutral-bubble text-ink", bg: "neutral-bubble", fg: "ink" },
  },
  tint: {
    amber: { cls: "bg-amber-tint text-amber-text", bg: "amber-tint", fg: "amber-text" },
    mint: { cls: "bg-mint-tint text-mint-text", bg: "mint-tint", fg: "mint-text" },
    periwinkle: { cls: "bg-periwinkle-tint text-periwinkle-text", bg: "periwinkle-tint", fg: "periwinkle-text" },
    coral: { cls: "bg-coral-tint text-coral-text", bg: "coral-tint", fg: "coral-text" },
    neutral: { cls: "bg-neutral-bubble text-text-secondary", bg: "neutral-bubble", fg: "text-secondary" },
  },
} as const satisfies Record<string, Record<BubbleTone, { cls: string; bg: ColorToken; fg: ColorToken }>>;

export interface IconBubbleProps {
  icon: IconName;
  tone?: BubbleTone;
  variant?: "solid" | "tint";
  /** 40 px radius 12, or 28 px radius 9 for compact rows. */
  size?: 40 | 28;
  className?: string;
}

export function IconBubble({ icon, tone = "amber", variant = "solid", size = 40, className }: IconBubbleProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === 40 ? "h-10 w-10 rounded-control" : "h-7 w-7 rounded-logo",
        bubbleVariants[variant][tone].cls,
        className,
      )}
      aria-hidden="true"
    >
      <Icon name={icon} size={size === 40 ? 20 : 16} />
    </span>
  );
}
