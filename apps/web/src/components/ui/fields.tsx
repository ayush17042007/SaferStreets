import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

export const controlBase =
  "w-full rounded-control border bg-card text-ink placeholder:text-text-muted font-body text-[16px] leading-6 " +
  "transition-[border-color,box-shadow] duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-chip";

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

/** Label + control + hint/error wired with aria-describedby (A4 inputs). */
export function FieldShell({ id, label, hint, error, optional, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] leading-5 font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-text-secondary"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1 text-[14px] leading-5 text-coral-text">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] leading-4 text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  id?: string;
  /** Leading icon inside the field (e.g. search). */
  leading?: ReactNode;
  forceFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  hint,
  error,
  optional,
  id,
  leading,
  className,
  forceFocus,
  ref,
  ...rest
}: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional}>
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary">
            {leading}
          </span>
        ) : null}
        <input
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fid, error, hint)}
          className={cn(
            controlBase,
            "h-12 px-3 md:h-11",
            leading && "pl-10",
            error ? "border-coral-text" : "border-line-control",
            forceFocus && "force-focus",
            className,
          )}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  id?: string;
  /** Shows "n / max" under the field. */
  counter?: { value: number; max: number };
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea({ label, hint, error, optional, id, counter, className, ref, ...rest }: TextAreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cn(
          controlBase,
          "min-h-28 px-3 py-2.5",
          error ? "border-coral-text" : "border-line-control",
          className,
        )}
        {...rest}
      />
      {counter ? (
        <p className="text-right text-[12px] leading-4 text-text-secondary" aria-live="polite">
          {counter.value} / {counter.max}
        </p>
      ) : null}
    </FieldShell>
  );
}

export type DateTimePickerProps = Omit<TextFieldProps, "type" | "leading">;

/** Native datetime-local, styled to the token controls (keeps the platform picker, works on mobile). */
export function DateTimePicker(props: DateTimePickerProps) {
  return <TextField type="datetime-local" {...props} />;
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> {
  label: ReactNode;
  error?: string;
  id?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Checkbox with a 44 px tall hit row. Error text uses coral-text with an icon, linked by aria-describedby. */
export function Checkbox({ label, error, id, className, ref, ...rest }: CheckboxProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={cid}
        className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-[14px] leading-5 text-ink"
      >
        <input
          ref={ref}
          id={cid}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${cid}-error` : undefined}
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-[6px] border border-line-control accent-ink",
            className,
          )}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${cid}-error`} className="flex items-start gap-1 text-[14px] leading-5 text-coral-text">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Toggle switch: ink track when on (A5.8). A real button with role=switch. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p id={`${id}-l`} className="text-[14px] leading-5 font-medium">
          {label}
        </p>
        {description ? <p className="text-[12px] leading-4 text-text-secondary">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-chip disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span
          className={cn(
            "relative h-6 w-11 rounded-chip transition-colors duration-fast",
            checked ? "bg-ink" : "bg-track",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-avatar bg-card transition-[left] duration-fast",
              checked ? "left-[22px]" : "left-0.5",
            )}
          />
        </span>
      </button>
    </div>
  );
}
