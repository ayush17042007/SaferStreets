import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import type { ColorToken } from "@/design/tokens";
import { Icon } from "./Icon";
import type { IconName } from "@/design/icons";
import { cn } from "./cn";

/** Each variant lists its class string and the token pair, which the contrast test checks. */
export const buttonVariants = {
  ink: { cls: "bg-ink text-white border border-ink hover:bg-ink-soft", bg: "ink", fg: "white" },
  amber: { cls: "bg-amber text-ink border border-amber hover:brightness-95", bg: "amber", fg: "ink" },
  secondary: {
    cls: "bg-card text-ink border border-line-control hover:bg-neutral-bubble",
    bg: "card",
    fg: "ink",
  },
  "ghost-on-dark": {
    cls: "bg-transparent text-white border border-ink-border hover:bg-ink-soft",
    bg: "ink",
    fg: "white",
  },
  emergency: {
    cls: "bg-coral-tint text-coral-text border border-coral-border hover:brightness-97",
    bg: "coral-tint",
    fg: "coral-text",
  },
  "emergency-solid": {
    cls: "bg-emergency-solid text-white border border-emergency-solid hover:brightness-95",
    bg: "emergency-solid",
    fg: "white",
  },
} as const satisfies Record<string, { cls: string; bg: ColorToken; fg: ColorToken }>;

export type ButtonVariant = keyof typeof buttonVariants;
/** 40 default, 44 on mobile, 48 for hero CTAs (A2). `sm` is a compact 32 px that keeps a 44 px hit area via a pseudo-element. */
export type ButtonSize = "default" | "mobile" | "hero" | "sm";

const sizeCls: Record<ButtonSize, string> = {
  default: "h-10 px-4 text-[14px] leading-5",
  mobile: "h-11 px-4 text-[14px] leading-5",
  hero: "h-12 px-7 text-[16px] leading-6",
  // 32 px visual height; the pseudo-element extends the hit area to 44 px (A2 minimum touch target).
  sm: "relative h-8 px-3 text-[13px] leading-5 min-h-8 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Trailing amber arrow, used on ink buttons ("Get started", "Continue"). */
  trailingArrow?: boolean;
  leadingIcon?: IconName;
  fullWidth?: boolean;
  asChild?: boolean;
  /** Forces the visual hover/focus state, for the gallery. */
  forceState?: "hover" | "focus";
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

export function Button({
  variant = "ink",
  size = "default",
  loading = false,
  trailingArrow = false,
  leadingIcon,
  fullWidth = false,
  asChild = false,
  forceState,
  disabled,
  className,
  children,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-body font-medium whitespace-nowrap",
    "transition-[background-color,filter,box-shadow] duration-fast ease-out select-none",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    loading && "disabled:cursor-progress disabled:opacity-100",
    buttonVariants[variant].cls,
    sizeCls[size],
    fullWidth && "w-full",
    forceState === "hover" && "brightness-95",
    forceState === "focus" && "force-focus",
    className,
  );

  if (asChild) {
    return (
      <Slot className={classes} aria-disabled={isDisabled || undefined} ref={ref as Ref<HTMLElement>}>
        {children as never}
      </Slot>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={isDisabled} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <Icon name="spinner" size={16} className="spin" />
      ) : leadingIcon ? (
        <Icon name={leadingIcon} size={16} />
      ) : null}
      {children}
      {trailingArrow && !loading ? (
        <Icon name="arrow" size={16} className={variant === "ink" ? "text-amber" : undefined} />
      ) : null}
    </button>
  );
}
