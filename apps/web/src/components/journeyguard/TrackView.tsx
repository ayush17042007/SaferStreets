"use client";

import type { TrackDto } from "@saferstreets/shared";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Banner, Button, Card, Skeleton, StatusChip } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/journeyguard";

const STATUS = {
  ON_THE_WAY: { tone: "neutral", label: "On the way", icon: "journeyguard" },
  RUNNING_LATE: { tone: "amber", label: "Running late", icon: "clock" },
  ARRIVED: { tone: "mint", label: "Arrived", icon: "check" },
  ENDED: { tone: "neutral", label: "Ended", icon: "close" },
} as const;

type Load = { state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ok"; data: TrackDto };

/** Public status page for a trusted contact. No account, no app shell, no location. */
export function TrackView({ token }: { token: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [stopped, setStopped] = useState<"idle" | "busy" | "done" | "failed">("idle");

  useEffect(() => {
    let alive = true;
    api<{ data: TrackDto }>(`/track/${encodeURIComponent(token)}`)
      .then((r) => alive && setLoad({ state: "ok", data: r.data }))
      .catch(
        (e) => alive && setLoad(e instanceof ApiError && e.status === 404 ? { state: "missing" } : { state: "error" }),
      );
    return () => {
      alive = false;
    };
  }, [token]);

  async function stop() {
    setStopped("busy");
    try {
      await api(`/track/${encodeURIComponent(token)}/unsubscribe`, { method: "POST" });
      setStopped("done");
    } catch {
      setStopped("failed");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex h-16 max-w-xl items-center px-4">
        <Logo />
      </header>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-2 pb-10">
        {load.state === "loading" ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : load.state === "missing" ? (
          <Card className="flex flex-col gap-2">
            <h1 className="type-h2">This link isn&apos;t available.</h1>
            <p className="text-[14px] leading-5 text-text-secondary">
              It may have been mistyped or is no longer in use.
            </p>
          </Card>
        ) : load.state === "error" ? (
          <Card className="flex flex-col gap-2">
            <h1 className="type-h2">We couldn&apos;t load this page.</h1>
            <p className="text-[14px] leading-5 text-text-secondary">Check your connection and reload.</p>
          </Card>
        ) : (
          <>
            <Card className="flex flex-col gap-4">
              <StatusChip
                tone={STATUS[load.data.status].tone}
                label={STATUS[load.data.status].label}
                icon={STATUS[load.data.status].icon}
                className="self-start"
              />
              <h1 className="type-h2 break-words">
                {load.data.firstName} is travelling to {load.data.destinationText}
              </h1>
              {load.data.trackingEnabled ? (
                <div className="flex flex-col gap-1 text-[14px] leading-5">
                  <p>
                    Safety status: <span className="font-semibold">{load.data.safetyState.replace(/_/g, " ")}</span>
                  </p>
                  {load.data.lastLat !== null && load.data.lastLng !== null ? (
                    <p className="text-text-secondary">
                      Last known GPS:{" "}
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${load.data.lastLat}&mlon=${load.data.lastLng}#map=16/${load.data.lastLat}/${load.data.lastLng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-ink underline"
                      >
                        {load.data.lastLat.toFixed(5)}, {load.data.lastLng.toFixed(5)}
                      </a>
                      {load.data.lastLocationAt ? ` (${formatDateTime(load.data.lastLocationAt)} IST)` : ""}
                    </p>
                  ) : (
                    <p className="text-text-secondary">Waiting for the first GPS location update.</p>
                  )}
                </div>
              ) : (
                <p className="text-[14px] leading-5 text-text-secondary">
                  Live location sharing is off for this journey.
                </p>
              )}
            </Card>

            <Banner tone="neutral" icon="emergency">
              Call 112 if you think someone is in danger.{" "}
              <a href="tel:112" className="font-semibold underline">
                Call 112
              </a>
            </Banner>

            <Card className="flex flex-col gap-3">
              {stopped === "done" ? (
                <p role="status" className="text-[14px] leading-5">
                  Done. You won&apos;t get more emails about journeys from {load.data.firstName}.
                </p>
              ) : (
                <>
                  <p className="text-[14px] leading-5 text-text-secondary">
                    Don&apos;t want these emails? You can stop them here.
                  </p>
                  <div>
                    <Button variant="secondary" size="mobile" loading={stopped === "busy"} onClick={() => void stop()}>
                      Stop these emails
                    </Button>
                  </div>
                  {stopped === "failed" ? (
                    <p role="alert" className="text-[14px] leading-5 text-coral-text">
                      We couldn&apos;t do that. Try again.
                    </p>
                  ) : null}
                </>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
