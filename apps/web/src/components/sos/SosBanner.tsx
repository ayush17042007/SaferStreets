"use client";

import Link from "next/link";
import { Button, Icon } from "@/components/ui";
import { useSosOptional } from "./SosProvider";

/**
 * Persistent emergency banner shown across all app pages while SOS is active.
 * Uses gentle 2s opacity pulse (motion-safe) — never rapid flashing.
 */
export function SosBanner() {
  const sos = useSosOptional();
  if (!sos?.active) return null;

  const audioBlocked = sos.audioStatus === "blocked" || sos.audioStatus === "unsupported";

  return (
    <section
      role="status"
      aria-live="assertive"
      aria-label="SOS emergency alarm active"
      className="mb-4 flex flex-col gap-3 rounded-card bg-emergency-solid p-4 text-white shadow-hover md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-start gap-3 md:items-center">
        <span
          aria-hidden="true"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-avatar bg-white/20 md:mt-0"
        >
          <span className="h-3 w-3 rounded-avatar bg-white motion-safe:animate-pulse" />
        </span>
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-chip bg-white px-2.5 py-0.5 text-[12px] leading-4 font-semibold tracking-wide text-emergency-solid">
              SOS ACTIVE
            </span>
            <span className="text-[14px] leading-5 font-semibold">
              {audioBlocked ? "Alarm state active (audio blocked by browser)" : "Emergency alarm is playing"}
            </span>
          </div>
          <p className="text-[13px] leading-5 text-white/90">
            {audioBlocked
              ? "Your browser blocked or does not support audio playback. Check your device volume or tap Stop SOS."
              : "Continuous alarm is playing on this device. This does not call 112 or notify contacts automatically."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          variant="secondary"
          size="mobile"
          className="border-white/30 bg-white/15 text-white hover:bg-white/25"
        >
          <Link href="/safealert/new">
            <Icon name="safealert" size={18} />
            Post a SafeAlert
          </Link>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="mobile"
          leadingIcon="stop"
          onClick={sos.stop}
          className="border-white bg-white font-semibold text-ink hover:bg-cream"
        >
          Stop SOS
        </Button>
      </div>
    </section>
  );
}
