// Original logo: 28 px rounded square (radius 9) in ink with an amber shield-check, plus wordmark.
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-logo bg-ink text-amber", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name="logo" size={size >= 28 ? 18 : 16} />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[18px] leading-6 font-semibold text-ink", className)}>SaferStreets</span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <Wordmark />
    </span>
  );
}
