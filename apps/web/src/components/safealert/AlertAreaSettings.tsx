"use client";

import {
  ALERT_MAX_RADIUS_KM,
  ALERT_MIN_RADIUS_KM,
  type AlertCategory,
  type AlertSubscriptionDto,
} from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Banner, Button, Card, ErrorState, Icon, Skeleton, Switch, cn, useToast } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { ALERT_CATEGORY_META, ALERT_CATEGORY_ORDER, CALL_112_LINE, HONEST_LINE } from "@/lib/safealert";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";

/** Settings tab "Safety alerts": where and what you want to hear about. Alerts are always Unverified. */
export function AlertAreaSettings() {
  const q = useQuery({
    queryKey: ["alert-subscription"],
    queryFn: () => api<{ data: AlertSubscriptionDto }>("/me/alert-subscription").then((r) => r.data),
  });
  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (q.isError) {
    return <ErrorState title="We couldn't load your alert settings" onRetry={() => void q.refetch()} />;
  }
  return <Form initial={q.data} />;
}

function Form({ initial }: { initial: AlertSubscriptionDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [center, setCenter] = useState<PickedLocation | null>(
    initial.centerLat !== null && initial.centerLng !== null
      ? { lat: initial.centerLat, lng: initial.centerLng, address: "" }
      : null,
  );
  const [radius, setRadius] = useState(initial.radiusKm);
  const [categories, setCategories] = useState<AlertCategory[]>(initial.categories);
  const [emailEnabled, setEmailEnabled] = useState(initial.emailEnabled);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api<{ data: AlertSubscriptionDto }>("/me/alert-subscription", {
        method: "PUT",
        body: {
          enabled,
          centerLat: center?.lat ?? null,
          centerLng: center?.lng ?? null,
          radiusKm: radius,
          categories,
          emailEnabled,
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(["alert-subscription"], res.data);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.show("Alert settings saved.");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "We couldn't save that. Try again."),
  });

  function toggleCategory(c: AlertCategory) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function onSave() {
    if (enabled && !center) {
      setError("Choose the centre of your alert area.");
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <Card className="flex flex-col gap-4">
      <Banner tone="neutral" icon="alert">
        Alerts are community-reported and Unverified. {CALL_112_LINE} {HONEST_LINE}
      </Banner>

      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Get alerts near me"
        description="You see alerts inside your area in Notifications. Off by default."
      />

      <div className={cn("flex flex-col gap-4", !enabled && "opacity-60")}>
        <div className="flex flex-col gap-2">
          <LocationPicker label="Centre of your alert area" value={center} onChange={setCenter} />
          {center ? (
            <p className="text-[12px] leading-4 text-text-secondary">We store this point, not your live location.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-radius" className="flex items-center justify-between text-[14px] leading-5 font-medium">
            Radius
            <span data-testid="radius-value">{radius} km</span>
          </label>
          <input
            id="alert-radius"
            type="range"
            min={ALERT_MIN_RADIUS_KM}
            max={ALERT_MAX_RADIUS_KM}
            step={1}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="h-11 w-full accent-ink"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[14px] leading-5 font-medium">Categories</legend>
          <p className="text-[12px] leading-4 text-text-secondary">
            {categories.length === 0 ? "None selected means every category." : `${categories.length} selected.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {ALERT_CATEGORY_ORDER.map((c) => {
              const on = categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCategory(c)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1 rounded-chip border px-3 text-[14px] leading-5 font-medium",
                    on ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:bg-neutral-bubble",
                  )}
                >
                  {on ? <Icon name="check" size={16} /> : null}
                  {ALERT_CATEGORY_META[c].label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Switch
          checked={emailEnabled}
          onCheckedChange={setEmailEnabled}
          label="Email me about alerts"
          description="Push notifications are not available."
        />
      </div>

      {error ? (
        <Banner tone="amber-warn" icon="alert">
          {error}
        </Banner>
      ) : null}

      <div>
        <Button size="mobile" loading={save.isPending} onClick={onSave}>
          Save
        </Button>
      </div>
    </Card>
  );
}
