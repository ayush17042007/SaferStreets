"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

export interface OTPInputProps {
  /** Current value, 0-6 digits. Controlled. */
  value: string;
  onChange: (value: string) => void;
  /** Called once when the sixth digit is entered. */
  onComplete?: (value: string) => void;
  length?: number;
  /** Error message; boxes show a coral-text border and shake once when it appears. */
  error?: string;
  disabled?: boolean;
  label?: string;
  autoFocus?: boolean;
}

/** Six 48 x 56 boxes, auto-advance, backspace-back, paste support, shake on error (A4). */
export function OTPInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  disabled,
  label = "6-digit code",
  autoFocus,
}: OTPInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const groupRef = useRef<HTMLDivElement>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    // Re-trigger the shake each time a new error appears.
    const el = groupRef.current;
    if (!error || !el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }, [error]);

  function commit(next: string, focusIndex: number) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    refs.current[Math.min(focusIndex, length - 1)]?.focus();
  }

  function onInput(i: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // A multi-character input (autofill) fills forward from this box.
    const next = (value.slice(0, i) + typed).slice(0, length);
    commit(next, i + typed.length);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) commit(value.slice(0, i) + value.slice(i + 1), i);
      else if (i > 0) commit(value.slice(0, i - 1) + value.slice(i), i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    commit(text, text.length);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={groupRef} role="group" aria-label={label} className="flex gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={length}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onInput(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              "h-14 w-12 rounded-control border bg-card text-center font-display text-[24px] leading-[30px] font-semibold text-ink",
              "transition-[border-color] duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-50",
              error ? "border-coral-text" : "border-line-control",
            )}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-[14px] leading-5 text-coral-text">
          <Icon name="error" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
