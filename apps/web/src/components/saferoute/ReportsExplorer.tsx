"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, Select, cn } from "@/components/ui";
import { CATEGORY_META, CATEGORY_ORDER, STATUS_NAME } from "@/lib/saferoute";
import { MapView } from "@/map/MapView";
import type { MapPoint } from "@/map/markers";
import { ReportRow, ReportRowSkeletons } from "./ReportRow";
import { useReports } from "./useReports";

const ALL = "ALL";
const categoryChips = [
  { value: ALL, label: "All" },
  ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_META[c].label })),
];
const statusOptions = [
  { value: ALL, label: "All statuses" },
  ...Object.entries(STATUS_NAME).map(([value, label]) => ({ value, label })),
];

/** S6: filter bar, list (left) and map (right) on desktop; map-first with the list below on mobile. */
export function ReportsExplorer() {
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    ...(category !== ALL ? { category } : {}),
    ...(status !== ALL ? { status } : {}),
  };
  const filtered = category !== ALL || status !== ALL;
  const q = useReports(filters);
  const clear = () => {
    setCategory(ALL);
    setStatus(ALL);
  };

  const points = useMemo<MapPoint[]>(
    () => q.reports.map((r) => ({ id: r.id, kind: "report", lat: r.latitude, lng: r.longitude, label: r.title })),
    [q.reports],
  );
  const first = q.reports[0];
  const center = first ? ([first.longitude, first.latitude] as [number, number]) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="type-h1">SafeRoute</h1>
          <p className="text-[14px] leading-5 text-text-secondary">
            Issues reported near you. Reports are unverified until a moderator checks them.
          </p>
        </div>
        <Button asChild className="max-md:hidden">
          <Link href="/saferoute/new">Report an issue</Link>
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <FilterBar label="Category" chips={categoryChips} selected={category} onSelect={setCategory} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52">
            <Select label="Status" options={statusOptions} value={status} onValueChange={setStatus} />
          </div>
          {filtered ? (
            <Button variant="secondary" size="mobile" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
          <div className="ml-auto flex gap-2 md:hidden" role="group" aria-label="View">
            {(["map", "list"] as const).map((v) => (
              <Button
                key={v}
                size="mobile"
                variant={view === v ? "ink" : "secondary"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "map" ? "Map" : "List"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="order-2 md:order-1">
          {q.isPending ? (
            <ReportRowSkeletons />
          ) : q.isError ? (
            <ErrorState
              title="We couldn't load reports"
              description="Check your connection and try again."
              onRetry={() => void q.refetch()}
            />
          ) : q.reports.length === 0 ? (
            filtered ? (
              <EmptyState
                art="reports"
                title="No reports match these filters"
                description="Try another category or status."
                actionLabel="Clear filters"
                onAction={clear}
              />
            ) : (
              <EmptyState
                art="reports"
                title="Be the first to report an issue nearby."
                description="Reports help the community and the people who fix things."
              />
            )
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Reports">
              {q.reports.map((r) => (
                <li key={r.id}>
                  <ReportRow report={r} selected={r.id === selectedId} />
                </li>
              ))}
              <li>
                {q.hasNextPage ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={q.isFetchingNextPage}
                    onClick={() => void q.fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : (
                  <p className="py-2 text-center text-[12px] leading-4 text-text-secondary">
                    You&apos;re all caught up.
                  </p>
                )}
              </li>
            </ul>
          )}
        </div>
        <div className={cn("order-1 md:order-2", view === "list" && "hidden md:block")}>
          <div className="md:sticky md:top-4">
            <MapView
              points={points}
              selectedId={selectedId}
              onSelect={setSelectedId}
              {...(center ? { center } : {})}
              label="Map of reports"
            />
          </div>
        </div>
      </div>

      <div className="fixed right-4 bottom-[88px] z-30 md:hidden">
        <Button asChild size="hero" className="shadow-popover">
          <Link href="/saferoute/new">Report an issue</Link>
        </Button>
      </div>
    </div>
  );
}
