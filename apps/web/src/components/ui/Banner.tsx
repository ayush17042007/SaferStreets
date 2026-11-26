import type { ReactNode } from "react";
import type { ColorToken } from "@/design/tokens";
import type { IconName } from "@/design/icons";
import { Icon } from "./Icon";
import { cn } from "./cn";

export const bannerVariants = {
  neutral: {
    cls: "bg-neutral-chip border-line text-text-secondary",
    bg: "neutral-chip",
    fg: "text-secondary",
    icon: "alert",
  },
  "amber-warn": {
    cls: "bg-amber-warn-bg border-amber-warn-border text-amber-text",
    bg: "amber-warn-bg",
    fg: "amber-text",
    icon: "alert",
  },
  coral: {
    cls: "bg-coral-tint border-coral-border text-coral-text",
    bg: "coral-tint",
    fg: "coral-text",
    icon: "emergency",
  },
} as const satisfies Record<string, { cls: string; bg: ColorToken; fg: ColorToken; icon: IconName }>;

export type BannerTone = keyof typeof bannerVariants;

/** Honest-limits and disclaimer banner: radius 14, 1 px matching border, leading icon, 14 px text (A4). */
export function Banner({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: BannerTone;
  icon?: IconName;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const v = bannerVariants[tone];
  return (
    <div
      className={cn("flex items-center gap-3 rounded-banner border p-3 text-[14px] leading-5", v.cls, className)}
      role="note"
    >
      <Icon name={icon ?? v.icon} size={20} className="shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
