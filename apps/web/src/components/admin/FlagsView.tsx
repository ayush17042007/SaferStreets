"use client";

import type { AdminFlagDto } from "@saferstreets/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, Skeleton, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { AdminStatus, PageHeading, ReasonDialog, fmtDate, rowCls } from "./kit";
import { useAdminList } from "./useAdminList";

const STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "ACTIONED", label: "Actioned" },
  { value: "DISMISSED", label: "Dismissed" },
];
const TYPES = [
  { value: "", label: "All types" },
  { value: "REPORT", label: "Reports" },
  { value: "ALERT", label: "Alerts" },
  { value: "RIDE", label: "Rides" },
  { value: "USER", label: "Users" },
  { value: "RIDE_MESSAGE", label: "Ride messages" },
];
const LINKS: Record<string, string> = { REPORT: "/saferoute/", ALERT: "/safealert/", RIDE: "/automate/" };
const TYPE_LABEL: Record<string, string> = {
  REPORT: "Report",
  ALERT: "Alert",
  RIDE: "Ride",
  USER: "User",
  RIDE_MESSAGE: "Ride message",
};

export function FlagsView() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("OPEN");
  const [type, setType] = useState("");
  const [acting, setActing] = useState<{ flag: AdminFlagDto; to: "ACTIONED" | "DISMISSED" } | null>(null);
  const { query, items } = useAdminList<AdminFlagDto>("/admin/flags", { status, targetType: type || undefined });

  async function resolve(note: string) {
    if (!acting) return;
    await api(`/admin/flags/${acting.flag.id}`, { method: "PATCH", body: { status: acting.to, note } });
    toast.show("Flag updated.");
    await qc.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Flags" />
      <FilterBar label="Flag status" chips={STATUSES} selected={status} onSelect={setStatus} />
      <FilterBar label="Flag type" chips={TYPES} selected={type} onSelect={setType} />
      {query.isPending ? (
        <Skeleton className="h-20" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No flags here" description="Flags from members show up in this list." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((f) => (
            <li key={f.id} className={`${rowCls} flex flex-col gap-2`} data-testid="flag-item">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] leading-5 font-semibold">{TYPE_LABEL[f.targetType] ?? f.targetType}</span>
                <AdminStatus status={f.status} />
              </div>
              <p className="text-[14px] leading-5">{f.reason}</p>
              {f.resolutionNote ? (
                <p className="text-[13px] leading-5 text-text-secondary">Note: {f.resolutionNote}</p>
              ) : null}
              <p className="text-[12px] leading-4 text-text-secondary">{fmtDate(f.createdAt)}</p>
              <div className="flex flex-wrap items-center gap-2">
                {LINKS[f.targetType] ? (
                  <Link
                    href={`${LINKS[f.targetType]}${f.targetId}`}
                    className="inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
                  >
                    Open public page
                  </Link>
                ) : null}
                {f.status === "OPEN" ? (
                  <>
                    <Button variant="ink" size="mobile" onClick={() => setActing({ flag: f, to: "ACTIONED" })}>
                      Action
                    </Button>
                    <Button variant="secondary" size="mobile" onClick={() => setActing({ flag: f, to: "DISMISSED" })}>
                      Dismiss
                    </Button>
                  </>
                ) : null}
              </div>
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
      <ReasonDialog
        open={acting !== null}
        onOpenChange={(o) => !o && setActing(null)}
        title={acting?.to === "ACTIONED" ? "Action this flag?" : "Dismiss this flag?"}
        description="Say what you decided and why. The note is kept with the flag."
        confirmLabel={acting?.to === "ACTIONED" ? "Action flag" : "Dismiss flag"}
        reasonLabel="Note"
        onSubmit={resolve}
      />
    </div>
  );
}
