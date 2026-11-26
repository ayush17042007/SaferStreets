import type { ButtonHTMLAttributes, Ref } from "react";
import type { IconName } from "@/design/icons";
import { Icon } from "./Icon";
import { cn } from "./cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  /** Small amber unread dot (notification bell). */
  dot?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** 44 x 44 minimum touch target (A2). */
export function IconButton({ icon, label, dot, className, type = "button", ref, ...rest }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        "relative inline-flex h-11 w-11 items-center justify-center rounded-control text-ink",
        "transition-colors duration-fast ease-out hover:bg-neutral-bubble disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={20} />
      {dot ? (
        <span
          className="absolute top-2.5 right-2.5 h-2 w-2 rounded-chip bg-amber ring-2 ring-cream"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
