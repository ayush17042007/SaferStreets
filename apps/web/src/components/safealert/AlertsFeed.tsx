"use client";

import type { AlertCategory, AlertDto } from "@saferstreets/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconBubble,
  InfiniteList,
  Skeleton,
  StatusChip,
  cn,
} from "@/components/ui";
import { api } from "@/lib/api";
import { ALERT_CATEGORY_META, ALERT_CATEGORY_ORDER, expiresIn, timeAgo } from "@/lib/safealert";
import { MapView } from "@/map/MapView";
import type { MapPoint } from "@/map/markers";
import { EmergencyBanner } from "./Call112";

interface ListResponse {
  data: AlertDto[];
  meta: { nextCursor: string | null };
}

function useAlertFeed(category: AlertCategory | null) {
  const q = useInfiniteQuery({
    queryKey: ["alerts", category],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (category) qs.set("category", category);
      if (pageParam) qs.set("cursor", pageParam);
      return api<ListResponse>(`/alerts?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  return { ...q, alerts: q.data?.pages.flatMap((p) => p.data) ?? [] };
}

/** M4 feed: community-reported, Unverified alerts. Guests see a limited card with no description. */
export function AlertsFeed({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [category, setCategory] = useState<AlertCategory | null>(null);
  const [showMap, setShowMap] = useState(true);
  const q = useAlertFeed(category);
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      q.alerts.map((a) => ({
        id: a.id,
        kind: "alert",
        lat: a.latitude,
        lng: a.longitude,
        label: ALERT_CATEGORY_META[a.category].label,
      })),
    [q.alerts],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="type-h1">SafeAlert</h1>
          <p className="text-[14px] leading-5 text-text-secondary">
            Short-lived alerts from people nearby. They expire after a few hours.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {signedIn ? (
            <Button asChild variant="secondary" leadingIcon="settings">
              <Link href="/settings#alerts">Alert area</Link>
            </Button>
          ) : null}
          <Button asChild leadingIcon="alert">
            <Link href="/safealert/new">Post an alert</Link>
          </Button>
        </div>
      </header>

      <EmergencyBanner text="SafeAlert is community-reported and Unverified. In an emergency call 112." />

      <div role="group" aria-label="Filter by category" className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" selected={category === null} onClick={() => setCategory(null)} />
          {ALERT_CATEGORY_ORDER.map((c) => (
            <FilterChip
              key={c}
              label={ALERT_CATEGORY_META[c].label}
              selected={category === c}
              onClick={() => setCategory(category === c ? null : c)}
            />
          ))}
        </div>
        {q.alerts.length > 0 ? (
          <Button type="button" variant="secondary" size="mobile" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Hide map" : "Show map"}
          </Button>
        ) : null}
      </div>

      {showMap && q.alerts.length > 0 ? (
        <MapView
          points={mapPoints}
          onSelect={(id) => router.push(`/safealert/${id}`)}
          label="Active SafeAlerts map"
        />
      ) : null}

      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : q.isError ? (
        <ErrorState
          title="We couldn't load alerts"
          description="Check your connection and try again."
          onRetry={() => void q.refetch()}
        />
      ) : q.alerts.length === 0 ? (
        <EmptyState
          art="quiet"
          title="All quiet"
          description={
            category
              ? "No active alerts in this category."
              : "No active alerts right now. If you see something, you can post one."
          }
        />
      ) : (
        <InfiniteList
          hasMore={q.hasNextPage}
          loadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          endLabel="That is every active alert."
        >
          <ul className="grid gap-3 md:grid-cols-2">
            {q.alerts.map((a) => (
              <li key={a.id}>
                <AlertListCard alert={a} signedIn={signedIn} />
              </li>
            ))}
          </ul>
        </InfiniteList>
      )}
    </div>
  );
}

function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-chip border px-3 text-[14px] leading-5 font-medium",
        selected ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:bg-neutral-bubble",
      )}
    >
      {selected ? <Icon name="check" size={16} /> : null}
      {label}
    </button>
  );
}

function AlertListCard({ alert, signedIn }: { alert: AlertDto; signedIn: boolean }) {
  const meta = ALERT_CATEGORY_META[alert.category];
  return (
    <Link
      href={`/safealert/${alert.id}`}
      data-testid="alert-card"
      className="flex h-full flex-col gap-2 rounded-card border border-line bg-card p-4 hover:border-line-control"
    >
      <div className="flex items-start gap-3">
        <IconBubble
          icon={meta.icon}
          variant="tint"
          tone={alert.category === "HARASSMENT" ? "amber" : "coral"}
          size={28}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-semibold">{meta.label}</p>
          <p className="text-[12px] leading-4 text-text-secondary">
            {timeAgo(alert.createdAt)} · {expiresIn(alert.expiresAt)}
          </p>
        </div>
        {alert.unverified ? (
          <StatusChip status="Unverified" />
        ) : (
          <StatusChip status="Verified" icon="verified" label="Verified by a moderator" />
        )}
      </div>
      {alert.description ? (
        <p className="line-clamp-2 text-[14px] leading-5">{alert.description}</p>
      ) : (
        <p className="text-[14px] leading-5 text-text-secondary">Log in to see details.</p>
      )}
      <p className="flex items-center gap-1 text-[12px] leading-4 text-text-secondary">
        <Icon name="saferoute" size={16} />
        {signedIn && alert.addressText ? alert.addressText : "Approximate location"}
      </p>
      <p className="text-[12px] leading-4 text-text-secondary">
        {alert.confirmCount} confirmed · {alert.disputeCount} disputed
      </p>
    </Link>
  );
}
