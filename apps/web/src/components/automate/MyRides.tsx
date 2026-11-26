"use client";

import type { RideCardDto } from "@saferstreets/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, ErrorState, FilterBar, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { RideListCard } from "./RideListCard";

type Role = "created" | "joined" | "requests" | "history";

const TABS: Array<{ value: Role; label: string; empty: string }> = [
  { value: "created", label: "Created", empty: "You have not offered a ride that is still active." },
  { value: "joined", label: "Joined", empty: "You have not joined a ride yet." },
  { value: "requests", label: "Requests", empty: "No pending requests." },
  { value: "history", label: "History", empty: "Completed and cancelled rides show up here." },
];

/** S13: my rides in four tabs, all from GET /rides/mine. */
export function MyRides() {
  const [role, setRole] = useState<Role>("created");
  const q = useQuery({
    queryKey: ["my-rides", role],
    queryFn: () => api<{ data: RideCardDto[] }>(`/rides/mine?role=${role}`),
  });
  const tab = TABS.find((t) => t.value === role)!;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">My rides</h1>
        <Button asChild>
          <Link href="/automate/new">Offer a ride</Link>
        </Button>
      </header>
      <FilterBar
        label="My rides"
        chips={TABS.map(({ value, label }) => ({ value, label }))}
        selected={role}
        onSelect={(v) => setRole(v as Role)}
      />
      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : q.isError ? (
        <ErrorState title="We couldn't load your rides" onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState art="quiet" title={tab.empty} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="my-rides">
          {q.data.data.map((r) => (
            <RideListCard key={r.id} ride={r} />
          ))}
        </div>
      )}
    </div>
  );
}
