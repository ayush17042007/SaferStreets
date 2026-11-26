"use client";

import Link from "next/link";
import { ErrorState, Icon, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { JourneyPanel } from "./JourneyPanel";
import { useJourneyById } from "./hooks";

export function JourneyDetail({ id }: { id: string }) {
  const q = useJourneyById(id);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/journeyguard"
        className="inline-flex min-h-11 items-center gap-1 text-[14px] leading-5 font-medium text-text-secondary"
      >
        <Icon name="back" size={16} />
        JourneyGuard
      </Link>
      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <p className="text-[14px] leading-5 text-text-secondary">This journey isn&apos;t available.</p>
        ) : (
          <ErrorState onRetry={() => void q.refetch()} />
        )
      ) : (
        <JourneyPanel journey={q.data} />
      )}
    </div>
  );
}
