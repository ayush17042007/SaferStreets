"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SystemPage } from "@/components/marketing/SystemPage";
import { Button } from "@/components/ui";

/** Global error boundary for every route segment: the 500 page, with a retry. */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <SystemPage
      code="500"
      art="reports"
      title="Something went wrong on our side"
      description="We couldn't load this page. Try again in a moment."
      actions={
        <>
          <Button size="mobile" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="secondary" size="mobile">
            <Link href="/">Back to home</Link>
          </Button>
        </>
      }
      note={
        error.digest ? <p className="text-[12px] leading-4 text-text-secondary">Reference: {error.digest}</p> : null
      }
    />
  );
}
