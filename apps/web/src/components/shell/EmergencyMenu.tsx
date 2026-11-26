"use client";

import * as Popover from "@radix-ui/react-popover";
import { Button, EMERGENCY_DISCLAIMER, EmergencyList, EmergencySheet, type EmergencyNumber } from "@/components/ui";
import { useEmergencyNumbers, useMinWidth } from "./hooks";

/**
 * Emergency helper: popover on desktop/tablet (>= 768), bottom sheet on mobile (A5.7).
 * `trigger` is the visible button; on desktop it anchors the popover.
 */
export function EmergencyMenu({
  open,
  onOpenChange,
  numbers: provided,
  trigger,
  surface,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dev/test override. In the app the numbers come from the public API. */
  numbers?: EmergencyNumber[];
  trigger?: boolean;
  /** Which surface this instance owns, so only one is ever mounted: sheet below 768, popover from 768. */
  surface: "sheet" | "popover";
}) {
  const numbers = useEmergencyNumbers(provided);
  const desktop = useMinWidth(768);

  if (surface === "sheet") {
    if (desktop) return null;
    return <EmergencySheet open={open} onOpenChange={onOpenChange} numbers={numbers} />;
  }

  // The trigger always renders (the header hides it below 768) so SSR has no layout shift.
  return (
    <Popover.Root open={open && desktop} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>
        <span className="inline-flex">
          {trigger ? (
            <Button
              variant="emergency"
              leadingIcon="emergency"
              onClick={() => onOpenChange(!open)}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              Emergency
            </Button>
          ) : null}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="fade-in z-50 w-[320px] rounded-card border border-line bg-card p-4 shadow-popover"
          aria-label="Emergency numbers"
        >
          <p className="type-h3 mb-1">Emergency numbers</p>
          <p className="mb-3 text-[14px] leading-5 text-text-secondary">{EMERGENCY_DISCLAIMER}</p>
          <EmergencyList numbers={numbers} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
