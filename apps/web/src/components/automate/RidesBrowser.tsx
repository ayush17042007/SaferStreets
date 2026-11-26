"use client";

import type { RideCardDto } from "@saferstreets/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  InfiniteList,
  Modal,
  Select,
  Skeleton,
  TextField,
} from "@/components/ui";
import { api } from "@/lib/api";
import { istInputValue } from "@/lib/automate";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";
import { RideListCard } from "./RideListCard";

interface ListResponse {
  data: RideCardDto[];
  meta: { nextCursor: string | null };
}

interface Filters {
  from: PickedLocation | null;
  to: PickedLocation | null;
  date: string;
  seats: string;
}

const NONE: Filters = { from: null, to: null, date: "", seats: "" };

function useRides(f: Filters) {
  const q = useInfiniteQuery({
    queryKey: ["rides", f],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (f.from) {
        qs.set("fromLat", String(f.from.lat));
        qs.set("fromLng", String(f.from.lng));
      }
      if (f.to) {
        qs.set("toLat", String(f.to.lat));
        qs.set("toLng", String(f.to.lng));
      }
      if (f.date) qs.set("date", f.date);
      if (f.seats) qs.set("seats", f.seats);
      if (pageParam) qs.set("cursor", pageParam);
      return api<ListResponse>(`/rides?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  return { ...q, rides: q.data?.pages.flatMap((p) => p.data) ?? [] };
}

/** S10: filters plus a list of open rides. Guests can browse; hosts are hidden from them. */
export function RidesBrowser({ signedIn }: { signedIn: boolean }) {
  const [filters, setFilters] = useState<Filters>(NONE);
  const q = useRides(filters);
  const active = Boolean(filters.from || filters.to || filters.date || filters.seats);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="type-h1">AutoMate</h1>
          <p className="text-[14px] leading-5 text-text-secondary">
            Share an auto with people heading your way. Fare is shared between riders in cash, outside SaferStreets.
          </p>
        </div>
        <div className="flex gap-2">
          {signedIn ? (
            <Button asChild variant="secondary">
              <Link href="/automate/mine">My rides</Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/automate/new">Offer a ride</Link>
          </Button>
        </div>
      </header>

      <FilterPanel value={filters} onChange={setFilters} active={active} />

      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : q.isError ? (
        <ErrorState
          title="We couldn't load rides"
          description="Check your connection and try again."
          onRetry={() => void q.refetch()}
        />
      ) : q.rides.length === 0 ? (
        <EmptyState
          art="quiet"
          title={active ? "No rides match these filters" : "No rides offered yet"}
          description={
            active ? "Try a different day or clear the filters." : "Offer the first ride and others can ask to join."
          }
        />
      ) : (
        <InfiniteList
          hasMore={q.hasNextPage}
          loadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          endLabel="That is every open ride."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {q.rides.map((r) => (
              <RideListCard key={r.id} ride={r} />
            ))}
          </div>
        </InfiniteList>
      )}
    </div>
  );
}

function FilterPanel({ value, onChange, active }: { value: Filters; onChange: (f: Filters) => void; active: boolean }) {
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [draft, setDraft] = useState<PickedLocation | null>(null);
  const today = istInputValue().slice(0, 10);

  function open(which: "from" | "to") {
    setDraft(value[which]);
    setPicking(which);
  }
  function apply() {
    if (picking) onChange({ ...value, [picking]: draft });
    setPicking(null);
  }
  const place = (p: PickedLocation | null) => (p ? p.address || "Pinned spot" : null);

  return (
    <section aria-label="Filters" className="rounded-card border border-line bg-card p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <PlaceButton
          label="From"
          value={place(value.from)}
          onOpen={() => open("from")}
          onClear={() => onChange({ ...value, from: null })}
        />
        <PlaceButton
          label="To"
          value={place(value.to)}
          onOpen={() => open("to")}
          onClear={() => onChange({ ...value, to: null })}
        />
        <TextField
          label="Date"
          type="date"
          min={today}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
        <Select
          label="Seats needed"
          value={value.seats || "ANY"}
          onValueChange={(v) => onChange({ ...value, seats: v === "ANY" ? "" : v })}
          options={[
            { value: "ANY", label: "Any" },
            { value: "1", label: "1 or more" },
            { value: "2", label: "2 or more" },
            { value: "3", label: "3" },
          ]}
        />
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => onChange(NONE)}
          className="mt-2 inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          Clear filters
        </button>
      ) : null}

      <Modal
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        title={picking === "to" ? "Going to" : "Leaving from"}
        description="Rides that start or end near this spot are shown."
      >
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
          <LocationPicker label="Place" value={draft} onChange={setDraft} />
          <Banner tone="neutral" icon="alert" title="Rough area only">
            Matching is approximate. Check the exact stop with the host.
          </Banner>
          <Button onClick={apply} disabled={!draft} fullWidth>
            Use this place
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function PlaceButton({
  label,
  value,
  onOpen,
  onClear,
}: {
  label: string;
  value: string | null;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] leading-5 font-medium">{label}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${label}: ${value ?? "any place"}. Change`}
          className="flex h-12 min-w-0 flex-1 items-center rounded-control border border-line-control bg-card px-3 text-left text-[16px] leading-6 md:h-11"
        >
          <span className={value ? "truncate" : "truncate text-text-secondary"}>{value ?? "Anywhere"}</span>
        </button>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-neutral-bubble"
          >
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
