"use client";

import type { AdminAuditDto } from "@saferstreets/shared";
import { useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton, TextField } from "@/components/ui";
import { PageHeading, fmtDate, rowCls } from "./kit";
import { useAdminList } from "./useAdminList";

export function AuditView() {
  const [text, setText] = useState("");
  const [action, setAction] = useState("");
  const { query, items } = useAdminList<AdminAuditDto>("/admin/audit", { action: action || undefined });
  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Audit log" />
      <form
        role="search"
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setAction(text.trim().toUpperCase());
        }}
      >
        <div className="md:flex-1">
          <TextField
            label="Filter by action"
            hint="For example SETTINGS_CHANGE or ROLE_CHANGE."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" size="mobile">
          Filter
        </Button>
      </form>
      {query.isPending ? (
        <Skeleton className="h-20" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No entries" description="Admin and moderator actions are recorded here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id} className={`${rowCls} flex flex-col gap-1`} data-testid="audit-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] leading-5 font-semibold">
                  {a.action.replaceAll("_", " ").toLowerCase()}
                </span>
                <span className="text-[12px] leading-4 text-text-secondary">{fmtDate(a.createdAt)}</span>
              </div>
              <p className="text-[14px] leading-5">{a.reason}</p>
              <p className="text-[12px] leading-4 text-text-secondary">
                By {a.actorName} on {a.targetType.toLowerCase()}
                {a.targetId ? ` ${a.targetId}` : ""}
              </p>
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
    </div>
  );
}
