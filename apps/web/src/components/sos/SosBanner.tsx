"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Icon } from "@/components/ui";
import { useSosOptional } from "./SosProvider";

/**
 * Persistent emergency banner shown across all app pages while SOS is active.
 * Includes nearby-user SOS delivery status and the simulated emergency services demonstration panel.
 */
export function SosBanner() {
  const sos = useSosOptional();
  const [simDone, setSimDone] = useState<Record<string, boolean>>({});
  if (!sos?.active) return null;

  const audioBlocked = sos.audioStatus === "blocked" || sos.audioStatus === "unsupported";

  return (
    <div className="mb-4 flex flex-col gap-3">
      <section
        role="status"
        aria-live="assertive"
        aria-label="SOS emergency alarm active"
        className="flex flex-col gap-3 rounded-card bg-emergency-solid p-4 text-white shadow-hover md:flex-row md:items-center md:justify-between"
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
              {sos.sosBusy
                ? "Getting GPS position and notifying nearby opted-in users..."
                : sos.sosEvent
                  ? `SOS event recorded (${sos.sosEvent.latitude.toFixed(4)}, ${sos.sosEvent.longitude.toFixed(4)}). Notified ${sos.sosEvent.notifiedCount} nearby opted-in ${sos.sosEvent.notifiedCount === 1 ? "user" : "users"} via in-app & email. ${sos.sosEvent.pushNote}`
                  : sos.sosError
                    ? sos.sosError
                    : audioBlocked
                      ? "Your browser blocked or does not support audio playback. Check your device volume or tap Stop SOS."
                      : "Continuous alarm is playing on this device."}
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

      <section
        aria-label="Emergency services demonstration panel"
        className="flex flex-col gap-3 rounded-card border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="type-h3 text-ink">Nearby emergency services (Demo)</h3>
            <p className="text-[12px] leading-4 text-text-secondary">
              Simulated demo actions only — no real police, ambulance, or fire service has been contacted or dispatched.
            </p>
          </div>
          <Button asChild variant="emergency-solid" size="mobile" leadingIcon="emergency">
            <a href="tel:112">India Emergency 112</a>
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {(
            [
              {
                key: "police",
                title: "Police station reminder — SIMULATED",
                places: sos.nearbyServices?.police ?? [],
              },
              {
                key: "ambulance",
                title: "Ambulance reminder — SIMULATED",
                places: sos.nearbyServices?.ambulance ?? [],
              },
              {
                key: "fire",
                title: "Fire service reminder — SIMULATED",
                places: sos.nearbyServices?.fire ?? [],
              },
            ] as const
          ).map((svc) => (
            <div key={svc.key} className="flex flex-col justify-between gap-2 rounded-control border border-line p-3">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-ink">{svc.title}</span>
                {svc.places.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-[12px] leading-4 text-text-secondary">
                    {svc.places.map((p) => (
                      <li key={`${svc.key}-${p.lat}-${p.lng}`} className="truncate">
                        {p.label} ({p.distanceKm} km)
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] leading-4 text-text-secondary">
                    Nearby places load automatically when GPS is available.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="mobile"
                onClick={() => setSimDone((prev) => ({ ...prev, [svc.key]: true }))}
              >
                {simDone[svc.key] ? "Reminder logged (SIMULATED)" : "Log simulated reminder"}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
