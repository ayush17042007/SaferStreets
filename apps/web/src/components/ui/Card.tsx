import type { ElementType, HTMLAttributes, ReactNode } from "react";
import type { ColorToken } from "@/design/tokens";
import { cn } from "./cn";

export type CardTone = "amber" | "mint" | "periwinkle" | "coral";

/** Tinted cards (landing bento) use the module tint, no border (A4). Pairs are contrast-tested. */
export const cardTones = {
  amber: { cls: "bg-amber-tint text-amber-text", bg: "amber-tint", fg: "amber-text" },
  mint: { cls: "bg-mint-tint text-mint-text", bg: "mint-tint", fg: "mint-text" },
  periwinkle: { cls: "bg-periwinkle-tint text-periwinkle-text", bg: "periwinkle-tint", fg: "periwinkle-text" },
  coral: { cls: "bg-coral-tint text-coral-text", bg: "coral-tint", fg: "coral-text" },
} as const satisfies Record<CardTone, { cls: string; bg: ColorToken; fg: ColorToken }>;

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** When `as` is a link component. */
  href?: string;
  /** Hover lift: border line-control, translateY(-1px), hover shadow. */
  interactive?: boolean;
  tone?: CardTone;
  /** Border colour override, e.g. the active journey card. */
  border?: "line" | "periwinkle-border" | "amber-warn-border";
  /** Forces the hover look (gallery). */
  forceHover?: boolean;
  children?: ReactNode;
}

const borderCls = {
  line: "border-line",
  "periwinkle-border": "border-periwinkle-border",
  "amber-warn-border": "border-amber-warn-border",
} as const;

/** Flat white card, radius 16, 1 px line border, padding 16-20 (A2, A4). */
export function Card({
  as: Tag = "div",
  interactive,
  tone,
  border = "line",
  forceHover,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card p-4 md:p-5",
        tone ? cardTones[tone].cls : cn("border bg-card text-ink", borderCls[border]),
        interactive &&
          "cursor-pointer transition-[transform,box-shadow,border-color] duration-fast ease-out hover:-translate-y-px hover:border-line-control hover:shadow-hover",
        forceHover && "-translate-y-px border-line-control shadow-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
