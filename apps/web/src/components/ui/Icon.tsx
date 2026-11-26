import { ICON_STROKE, icons, type IconName, type IconSize } from "@/design/icons";

export interface IconProps {
  name: IconName;
  size?: IconSize | 14 | 28;
  className?: string;
  /** Decorative by default; pass a label only for icon-only meaning. */
  label?: string;
}

export function Icon({ name, size = 20, className, label }: IconProps) {
  const Cmp = icons[name];
  return (
    <Cmp
      size={size}
      stroke={ICON_STROKE}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
