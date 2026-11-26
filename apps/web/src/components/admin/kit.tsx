"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { Button, Icon, Modal, StatusChip, TextArea, type ChipTone } from "@/components/ui";
import type { IconName } from "@/design/icons";
import { ApiError } from "@/lib/api";

export interface Page<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
export const fmtDate = (iso: string) => when.format(new Date(iso));

export function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : "We couldn't complete that. Try again.";
}

const STATUS: Record<string, { label: string; tone: ChipTone; icon?: IconName }> = {
  SUBMITTED: { label: "Submitted", tone: "neutral" },
  UNDER_REVIEW: { label: "Under review", tone: "amber" },
  AWAITING_REVIEW: { label: "Awaiting review", tone: "amber" },
  ACTIVE: { label: "Active", tone: "mint" },
  VERIFIED: { label: "Verified", tone: "mint", icon: "verified" },
  IN_PROGRESS: { label: "In progress", tone: "periwinkle" },
  RESOLVED: { label: "Resolved", tone: "mint" },
  REJECTED: { label: "Rejected", tone: "coral" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
  REMOVED: { label: "Removed", tone: "coral" },
  OPEN: { label: "Open", tone: "amber" },
  ACTIONED: { label: "Actioned", tone: "mint" },
  SUSPENDED: { label: "Suspended", tone: "amber" },
  BANNED: { label: "Banned", tone: "coral" },
  FULL: { label: "Full", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "neutral" },
};

/** Status is always text; the tone is only a hint. */
export function AdminStatus({ status }: { status: string }) {
  const s = STATUS[status];
  const label = s?.label ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
  return <StatusChip tone={s?.tone ?? "neutral"} label={label} {...(s?.icon ? { icon: s.icon } : {})} />;
}

export function roleLabel(role: string): string {
  return role === "ADMIN" ? "Admin" : role === "MODERATOR" ? "Moderator" : "Member";
}

/** Right-hand panel (full width on mobile). */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content className="fade-in fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-card p-5 shadow-popover">
          <Dialog.Title className="type-h3 pr-10 text-ink">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[14px] leading-5 text-text-secondary">
            {description ?? "Details and actions"}
          </Dialog.Description>
          <div className="mt-4 flex flex-col gap-4">{children}</div>
          <Dialog.Close
            aria-label="Close"
            className="absolute top-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-text-secondary hover:bg-neutral-bubble"
          >
            <Icon name="close" size={20} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirm dialog with a reason field. Red only when `destructive`. Shows the API error inline. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  required = true,
  reasonLabel = "Reason",
  extraValid = true,
  children,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  required?: boolean;
  reasonLabel?: string;
  extraValid?: boolean;
  children?: ReactNode;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const valid = extraValid && (required ? trimmed.length >= 3 : trimmed.length === 0 || trimmed.length >= 3);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setReason("");
      onOpenChange(false);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
      title={title}
      {...(description ? { description } : {})}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void submit();
        }}
      >
        {children}
        <TextArea
          label={reasonLabel}
          hint={required ? "At least 3 characters. Recorded in the audit log." : "Optional. Recorded with the change."}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
        />
        {error ? (
          <p role="alert" className="text-[14px] leading-5 text-coral-text">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" size="mobile" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={destructive ? "emergency-solid" : "ink"}
            size="mobile"
            loading={busy}
            disabled={!valid}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="type-h1">{title}</h1>
      {children}
    </div>
  );
}

export const rowCls = "rounded-card border border-line bg-card p-4";
