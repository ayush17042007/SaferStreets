"use client";

import type { AdminFlagDto, AdminQueueItemDto } from "@saferstreets/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, Skeleton, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { AdminStatus, PageHeading, ReasonDialog, SidePanel, fmtDate, rowCls, type Page } from "./kit";
import { useAdminList } from "./useAdminList";

const TABS = [
  { value: "reports", label: "Reports" },
  { value: "alerts", label: "Alerts" },
  { value: "rides", label: "Rides" },
  { value: "users", label: "Users" },
];

/** Allowed report moves (appendix-03). */
const REPORT_NEXT: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["VERIFIED"],
};
const ALERT_NEXT = ["VERIFIED", "DISMISSED", "REMOVED"];

const ACTION_LABEL: Record<string, string> = {
  UNDER_REVIEW: "Start review",
  VERIFIED: "Verify",
  REJECTED: "Reject",
  IN_PROGRESS: "Mark in progress",
  RESOLVED: "Mark resolved",
  DISMISSED: "Dismiss",
  REMOVED: "Remove",
};

const TARGET: Record<AdminQueueItemDto["kind"], { type: string; href: (id: string) => string | null }> = {
  report: { type: "REPORT", href: (id) => `/saferoute/${id}` },
  alert: { type: "ALERT", href: (id) => `/safealert/${id}` },
  ride: { type: "RIDE", href: (id) => `/automate/${id}` },
  user: { type: "USER", href: () => null },
};

export function QueueView() {
  const [tab, setTab] = useState("reports");
  const [selected, setSelected] = useState<AdminQueueItemDto | null>(null);
  const { query, items } = useAdminList<AdminQueueItemDto>("/admin/queue", { tab });

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Moderation queue" />
      <FilterBar
        label="Queue tabs"
        chips={TABS}
        selected={tab}
        onSelect={(v) => {
          setTab(v);
          setSelected(null);
        }}
      />
      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing waiting" description="New items appear here when they need a decision." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setSelected(it)}
                className={`${rowCls} flex w-full flex-wrap items-center justify-between gap-3 text-left hover:bg-neutral-bubble`}
                data-testid="queue-item"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-5 font-semibold">{it.title}</span>
                  <span className="block truncate text-[13px] leading-5 text-text-secondary">{it.subtitle}</span>
                  <span className="block text-[12px] leading-4 text-text-secondary">{fmtDate(it.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {it.openFlags > 0 ? (
                    <span className="text-[12px] leading-4 font-medium text-amber-text">
                      {it.openFlags} open {it.openFlags === 1 ? "flag" : "flags"}
                    </span>
                  ) : null}
                  <AdminStatus status={it.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
      {selected ? <ItemPanel item={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ItemPanel({ item, onClose }: { item: AdminQueueItemDto; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<string | null>(null);
  const target = TARGET[item.kind];
  const link = target.href(item.id);
  const next = item.kind === "report" ? (REPORT_NEXT[item.status] ?? []) : item.kind === "alert" ? ALERT_NEXT : [];

  const flags = useQuery({
    queryKey: ["admin", "item-flags", target.type, item.id],
    queryFn: () =>
      api<Page<AdminFlagDto>>(`/admin/flags?status=OPEN&targetType=${target.type}&limit=50`).then((r) =>
        r.data.filter((f) => f.targetId === item.id),
      ),
    enabled: item.openFlags > 0,
  });

  async function apply(reason: string) {
    if (!action) return;
    const path = item.kind === "report" ? `/admin/reports/${item.id}/status` : `/admin/alerts/${item.id}/status`;
    const body =
      item.kind === "report" ? { status: action, ...(reason ? { note: reason } : {}) } : { status: action, reason };
    await api(path, { method: "PATCH", body });
    toast.show(`${item.kind === "report" ? "Report" : "Alert"} updated.`);
    await qc.invalidateQueries({ queryKey: ["admin"] });
    onClose();
  }

  return (
    <SidePanel open onOpenChange={(o) => !o && onClose()} title={item.title} description={item.subtitle}>
      <div className="flex flex-wrap items-center gap-2">
        <AdminStatus status={item.status} />
        <span className="text-[12px] leading-4 text-text-secondary">{fmtDate(item.createdAt)}</span>
      </div>
      {item.kind === "alert" ? (
        <p className="text-[14px] leading-5 text-text-secondary">Unverified until a moderator verifies it.</p>
      ) : null}
      {link ? (
        <Link
          href={link}
          className="inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          Open public page
        </Link>
      ) : null}
      {item.openFlags > 0 ? (
        <section aria-label="Flags on this item" className="flex flex-col gap-2">
          <h3 className="type-h3">Open flags ({item.openFlags})</h3>
          {flags.isPending ? (
            <Skeleton className="h-10" />
          ) : (
            <ul className="flex flex-col gap-2">
              {(flags.data ?? []).map((f) => (
                <li key={f.id} className="rounded-control border border-line p-3 text-[14px] leading-5">
                  {f.reason}
                  <span className="block text-[12px] leading-4 text-text-secondary">{fmtDate(f.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/flags" className="text-[14px] leading-5 font-semibold underline">
            Resolve flags
          </Link>
        </section>
      ) : null}
      {next.length > 0 ? (
        <section aria-label="Actions" className="flex flex-col gap-2">
          <h3 className="type-h3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <Button
                key={s}
                variant={s === "REJECTED" || s === "REMOVED" || s === "DISMISSED" ? "secondary" : "ink"}
                size="mobile"
                onClick={() => setAction(s)}
              >
                {ACTION_LABEL[s] ?? s}
              </Button>
            ))}
          </div>
        </section>
      ) : item.kind === "report" || item.kind === "alert" ? null : (
        <p className="text-[14px] leading-5 text-text-secondary">
          {item.kind === "user"
            ? "Manage this member from the Users page."
            : "Review the ride page and resolve its flags."}
        </p>
      )}
      <ReasonDialog
        open={action !== null}
        onOpenChange={(o) => !o && setAction(null)}
        title={`${action ? (ACTION_LABEL[action] ?? action) : ""}?`}
        description={
          item.kind === "report"
            ? "The reporter is notified of the new status."
            : "The change is recorded in the audit log."
        }
        confirmLabel={action ? (ACTION_LABEL[action] ?? "Confirm") : "Confirm"}
        destructive={action === "REMOVED"}
        required={item.kind === "alert" || action === "REJECTED"}
        reasonLabel={item.kind === "report" ? "Note" : "Reason"}
        onSubmit={apply}
      />
    </SidePanel>
  );
}
