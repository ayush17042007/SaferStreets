import * as RadixSelect from "@radix-ui/react-select";
import { useId } from "react";
import { FieldShell, controlBase } from "./fields";
import { Icon } from "./Icon";
import { cn } from "./cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  optional?: boolean;
  /** Opens the list on mount (gallery only). */
  defaultOpen?: boolean;
}

export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select",
  hint,
  error,
  disabled,
  optional,
  defaultOpen,
}: SelectProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled} defaultOpen={defaultOpen}>
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            controlBase,
            "flex h-12 items-center justify-between px-3 text-left md:h-11",
            error ? "border-coral-text" : "border-line-control",
            "data-[placeholder]:text-text-secondary",
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <Icon name="chevronDown" size={16} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="fade-in z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-line bg-card shadow-popover"
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((o) => (
                <RadixSelect.Item
                  key={o.value}
                  value={o.value}
                  className="flex h-11 cursor-pointer items-center justify-between rounded-control-sm px-3 text-[14px] leading-5 text-ink outline-none data-[highlighted]:bg-neutral-bubble data-[state=checked]:font-semibold"
                >
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Icon name="check" size={16} className="text-ink" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </FieldShell>
  );
}
