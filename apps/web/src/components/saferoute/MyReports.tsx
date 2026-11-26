"use client";

import type { ReportCardDto, ReportStatus } from "@saferstreets/shared";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorState, Tabs } from "@/components/ui";
import { ReportRow, ReportRowSkeletons } from "./ReportRow";
import { useReports } from "./useReports";

const GROUPS: Array<{ value: string; label: string; statuses: ReportStatus[] | null }> = [
  { value: "all", label: "All", statuses: null },
  { value: "open", label: "Open", statuses: ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "IN_PROGRESS"] },
  { value: "resolved", label: "Resolved", statuses: ["RESOLVED"] },
  { value: "rejected", label: "Rejected", statuses: ["REJECTED"] },
];

/** S9: the signed-in user's reports, grouped by status. */
export function MyReports() {
  const router = useRouter();
  const q = useReports({ mine: true });

  function list(reports: ReportCardDto[]) {
    if (reports.length === 0) {
      return <p className="py-6 text-center text-[14px] leading-5 text-text-secondary">Nothing in this group yet.</p>;
    }
    return (
      <ul className="flex flex-col gap-3" aria-label="My reports">
        {reports.map((r) => (
          <li key={r.id}>
            <ReportRow report={r} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">My reports</h1>
        <Button onClick={() => router.push("/saferoute/new")}>Report an issue</Button>
      </header>

      {q.isPending ? (
        <ReportRowSkeletons />
      ) : q.isError ? (
        <ErrorState
          title="We couldn't load your reports"
          description="Check your connection and try again."
          onRetry={() => void q.refetch()}
        />
      ) : q.reports.length === 0 ? (
        <EmptyState
          art="reports"
          title="You haven't reported anything yet"
          description="Spotted a broken light or a bad road? Tell the community."
          actionLabel="Report an issue"
          onAction={() => router.push("/saferoute/new")}
        />
      ) : (
        <>
          <Tabs
            label="Reports by status"
            items={GROUPS.map((g) => ({
              value: g.value,
              label: g.label,
              content: list(g.statuses ? q.reports.filter((r) => g.statuses!.includes(r.status)) : q.reports),
            }))}
          />
          {q.hasNextPage ? (
            <Button variant="secondary" fullWidth loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
