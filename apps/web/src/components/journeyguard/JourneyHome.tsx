"use client";

import { useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, ErrorState, Icon, InfiniteList, Skeleton, TextField, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/journeyguard";
import { StartJourneyForm } from "./StartJourneyForm";
import { JourneyPanel, JourneyStatusChip } from "./JourneyPanel";
import { useActiveJourney, useJourneyHistory } from "./hooks";

/** The share link exists only in the response that starts the journey, so it is shown once, here. */
function ShareLink({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Link copied.");
    } catch {
      toast.show("Copy didn't work. Select the link and copy it.", "error");
    }
  }
  return (
    <Card className="flex flex-col gap-3" aria-label="Share link">
      <h2 className="type-h3">Journey started</h2>
      <p className="text-[14px] leading-5 text-text-secondary">
        Your trusted contact can open this link to see your journey status and last known GPS update if a safety
        condition occurs. Copy it if you want to share it directly.
      </p>
      <TextField label="Status link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex gap-2">
        <Button variant="secondary" size="mobile" onClick={() => void copy()}>
          Copy link
        </Button>
        <Button variant="secondary" size="mobile" onClick={onDismiss}>
          Hide link
        </Button>
      </div>
    </Card>
  );
}

function History() {
  const q = useJourneyHistory();
  if (q.isPending) return <Skeleton className="h-20 w-full" />;
  if (q.isError)
    return (
      <ErrorState
        title="We couldn't load your past journeys"
        onRetry={() => void q.refetch()}
        {...(q.error instanceof ApiError ? { code: q.error.code } : {})}
      />
    );
  const rows = q.data.pages.flatMap((p) => p.data);
  if (rows.length === 0)
    return <p className="text-[14px] leading-5 text-text-secondary">Your finished journeys will show up here.</p>;
  return (
    <InfiniteList
      hasMore={Boolean(q.hasNextPage)}
      loadingMore={q.isFetchingNextPage}
      onLoadMore={() => void q.fetchNextPage()}
      endLabel="That's all your past journeys."
    >
      <ul className="flex flex-col gap-3">
        {rows.map((j) => (
          <li key={j.id}>
            <Card as="div" className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/journeyguard/${j.id}`}
                  className="block min-h-6 truncate text-[14px] leading-5 font-medium"
                >
                  To {j.destinationText}
                </Link>
                <p className="text-[12px] leading-4 text-text-secondary">{formatDateTime(j.startedAt)}</p>
              </div>
              <JourneyStatusChip status={j.status} />
            </Card>
          </li>
        ))}
      </ul>
    </InfiniteList>
  );
}

/** S15: JourneyGuard home. Start form when nothing is active, the live journey otherwise, then history. */
export function JourneyHome() {
  const active = useActiveJourney();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="type-h1">JourneyGuard</h1>
        <p className="text-[14px] leading-5 text-text-secondary">
          Start a protected journey. Live GPS monitoring detects route deviations, unexpected stops, and missed arrival
          times — and notifies your trusted contact if something looks wrong.
        </p>
      </header>

      {active.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : active.isError ? (
        <ErrorState onRetry={() => void active.refetch()} />
      ) : active.data ? (
        <>
          {shareUrl ? <ShareLink url={shareUrl} onDismiss={() => setShareUrl(null)} /> : null}
          <JourneyPanel journey={active.data} />
        </>
      ) : (
        <StartJourneyForm onStarted={(j) => setShareUrl(j.trackUrl ?? null)} />
      )}

      <section aria-label="Past journeys" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="type-h3">Past journeys</h2>
          <Link
            href="/journeyguard/contacts"
            className="inline-flex min-h-11 items-center gap-1 text-[14px] leading-5 font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
          >
            <Icon name="users" size={16} />
            Trusted contacts
          </Link>
        </div>
        <History />
      </section>

      {!active.data && !active.isPending ? (
        <Banner tone="neutral" icon="emergency">
          SaferStreets is not an emergency service. If anyone is in danger, call 112 first.
        </Banner>
      ) : null}
    </div>
  );
}
