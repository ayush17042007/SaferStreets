"use client";

import { useState } from "react";
import { Button, ConfirmDialog, Icon } from "@/components/ui";
import { useSos } from "@/components/sos/SosProvider";

/**
 * Prominent SOS emergency alarm trigger on the Home/Dashboard page.
 * When active, the persistent SosBanner in AppShell takes over so the user
 * can stop the alarm from any screen.
 */
export function SosControl() {
  const sos = useSos();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (sos.active) return null;

  return (
    <>
      <section
        aria-label="SOS emergency alarm"
        className="flex flex-col gap-3 rounded-card border border-coral-border bg-coral-tint p-4 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex items-start gap-3 md:items-center">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-avatar bg-emergency-solid text-white"
          >
            <Icon name="safealert" size={20} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="type-h3 text-ink">SOS emergency alarm</h2>
            <p className="text-[13px] leading-5 text-coral-text">
              Sounds an alarm on this device and shares your GPS location with nearby opted-in SaferStreets users. Does not call 112.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="emergency"
          size="hero"
          leadingIcon="safealert"
          onClick={() => setConfirmOpen(true)}
          className="w-full shrink-0 md:w-auto"
          aria-label="SOS: Activate emergency alarm"
        >
          SOS · Activate emergency alarm
        </Button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Activate SOS emergency alarm?"
        description="This plays a loud alarm on your device and shares your current GPS location with nearby opted-in SaferStreets users. It does not call 112 or dispatch emergency services."
        confirmLabel="Activate SOS alarm"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          void sos.activate();
        }}
      />
    </>
  );
}
