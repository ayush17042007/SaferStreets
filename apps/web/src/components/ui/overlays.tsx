"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { cn } from "./cn";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
}

function Overlay() {
  return <Dialog.Overlay className="fade-in fixed inset-0 z-50 bg-overlay" />;
}

function CloseButton() {
  return (
    <Dialog.Close
      aria-label="Close"
      className="absolute top-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-text-secondary transition-colors duration-fast hover:bg-neutral-bubble"
    >
      <Icon name="close" size={20} />
    </Dialog.Close>
  );
}

/** Centred modal: radius 20, white, 220 ms fade. */
export function Modal({ open, onOpenChange, title, description, children }: BaseProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className="fade-in fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-card p-6 shadow-popover">
          <Dialog.Title className="type-h3 pr-10 text-ink">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-[14px] leading-5 text-text-secondary">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          <CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirm before destructive or major actions (appendix-04 4.4). Destructive uses the emergency (coral) treatment. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
}: Omit<BaseProps, "children"> & {
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} {...(description ? { description } : {})}>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="secondary" size="mobile" onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "emergency" : "ink"}
          size="mobile"
          loading={loading ?? false}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Mobile bottom sheet: slides up in 220 ms, radius 24 on top corners. */
export function BottomSheet({ open, onOpenChange, title, description, children }: BaseProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className="sheet-in fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-hero border border-line bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-popover">
          <span className="mx-auto mb-3 block h-1 w-10 rounded-chip bg-track" aria-hidden="true" />
          <Dialog.Title className="type-h3 pr-10 text-ink">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-[14px] leading-5 text-text-secondary">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          <CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface EmergencyNumber {
  key: string;
  label: string;
  number: string;
}

export const EMERGENCY_DISCLAIMER = "SaferStreets is not an emergency service. If anyone is in danger, call 112 first.";

/** tel: links; the first number (112) is the solid emergency button, the rest use the coral-tint treatment. */
export function EmergencyList({ numbers }: { numbers: EmergencyNumber[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {numbers.map((n, i) => (
        <li key={n.key}>
          <a
            href={`tel:${n.number}`}
            className={cn(
              "flex min-h-11 items-center justify-between gap-3 rounded-control border px-4 py-3 text-[14px] leading-5 font-medium",
              i === 0
                ? "border-emergency-solid bg-emergency-solid text-white"
                : "border-coral-border bg-coral-tint text-coral-text",
            )}
          >
            <span className="flex items-center gap-2">
              <Icon name="emergency" size={20} />
              {n.label}
            </span>
            <span className="font-display font-semibold">{n.number}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Emergency sheet shell (mobile): numbers come from props (configurable via system settings), each a tel: link. */
export function EmergencySheet({
  open,
  onOpenChange,
  numbers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numbers: EmergencyNumber[];
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Emergency numbers" description={EMERGENCY_DISCLAIMER}>
      <EmergencyList numbers={numbers} />
    </BottomSheet>
  );
}
