"use client";

import type { AdminOverviewDto } from "@saferstreets/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, ErrorState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { PageHeading } from "./kit";

const STATS: Array<{ key: keyof AdminOverviewDto; label: string; href?: string }> = [
  { key: "reportsToReview", label: "Reports to review", href: "/admin/queue" },
  { key: "alertsToReview", label: "Alerts to review", href: "/admin/queue" },
  { key: "openFlags", label: "Open flags", href: "/admin/flags" },
  { key: "activeAlerts", label: "Active alerts" },
  { key: "openRides", label: "Open rides" },
  { key: "activeJourneys", label: "Active journeys" },
  { key: "usersTotal", label: "Users", href: "/admin/users" },
  { key: "usersSuspended", label: "Suspended users", href: "/admin/users" },
];

export function OverviewView() {
  const q = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api<{ data: AdminOverviewDto }>("/admin/overview").then((r) => r.data),
  });
  return (
    <div>
      <PageHeading title="Admin overview" />
      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true">
          {STATS.map((s) => (
            <Skeleton key={s.key} className="h-24" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATS.map((s) => {
            const body = (
              <Card className="flex h-full flex-col gap-1">
                <span className="font-heading text-[28px] leading-9 font-bold" data-testid={`stat-${s.key}`}>
                  {q.data[s.key]}
                </span>
                <span className="text-[14px] leading-5 text-text-secondary">{s.label}</span>
              </Card>
            );
            return (
              <li key={s.key}>
                {s.href ? (
                  <Link href={s.href} className="block h-full rounded-card">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
