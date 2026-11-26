"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  IconBubble,
  Icon,
  Skeleton,
  cn,
  type BubbleTone,
} from "@/components/ui";
import { useState } from "react";
import type { IconName } from "@/design/icons";
import { api } from "@/lib/api";

interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function look(type: string): { icon: IconName; tone: BubbleTone } {
  if (type.startsWith("REPORT")) return { icon: "saferoute", tone: "amber" };
  if (type.startsWith("RIDE")) return { icon: "automate", tone: "mint" };
  if (type.startsWith("JOURNEY")) return { icon: "journeyguard", tone: "periwinkle" };
  if (type.startsWith("ALERT")) return { icon: "safealert", tone: "coral" };
  return { icon: "notifications", tone: "neutral" };
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** Notification centre: Today / Earlier groups, All / Unread filter, click opens the link and marks read. */
export function NotificationsList() {
  const qc = useQueryClient();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const q = useInfiniteQuery({
    queryKey: ["notifications", "list", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ data: NotificationDto[]; meta: { nextCursor: string | null } }>(
        `/notifications?limit=20${filter === "unread" ? "&unread=true" : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSettled: refresh,
  });

  function open(n: NotificationDto) {
    if (!n.read) readOne.mutate(n.id);
    if (n.link && n.link.startsWith("/") && !n.link.startsWith("//")) router.push(n.link);
  }

  const groups = [
    { label: "Today", rows: items.filter((n) => isToday(n.createdAt)) },
    { label: "Earlier", rows: items.filter((n) => !isToday(n.createdAt)) },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h1">Notifications</h1>
        <Button
          variant="secondary"
          disabled={items.every((n) => n.read)}
          loading={readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          Mark all read
        </Button>
      </header>
      <FilterBar
        label="Filter notifications"
        chips={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
        selected={filter}
        onSelect={(v) => setFilter(v as "all" | "unread")}
      />
      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "You're all caught up" : "Nothing new"}
          description="Updates on your reports and rides show up here."
        />
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
            <h2 className="type-h3">{g.label}</h2>
            <div className="rounded-card border border-line bg-card px-4">
              {g.rows.map((n) => {
                const l = look(n.type);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => open(n)}
                    className="flex min-h-14 w-full items-center gap-3 border-b border-line py-3 text-left last:border-b-0"
                    data-testid="notification"
                  >
                    <IconBubble icon={l.icon} tone={l.tone} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[14px] leading-5", !n.read && "font-semibold")}>
                        {n.body ? `${n.title}. ${n.body}` : n.title}
                      </span>
                      <span className="flex items-center gap-2 text-[12px] leading-4 text-text-secondary">
                        {ago(n.createdAt)}
                        {!n.read ? (
                          <span className="inline-flex items-center gap-1 font-medium text-ink">
                            <span className="h-1.5 w-1.5 rounded-chip bg-amber" aria-hidden="true" />
                            Unread
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} className="shrink-0 text-text-muted" />
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
      {q.hasNextPage ? (
        <Button variant="secondary" fullWidth loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
