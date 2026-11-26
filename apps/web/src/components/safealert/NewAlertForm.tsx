"use client";

import type { AlertCategory, AlertDto, AlertSubscriptionDto } from "@saferstreets/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Card, CategoryTile, Switch, TextArea } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import { newIdempotencyKey } from "@/lib/saferoute";
import { ALERT_CATEGORY_META, ALERT_CATEGORY_ORDER, CALL_112_LINE, HONEST_LINE } from "@/lib/safealert";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";
import { EmergencyBanner } from "./Call112";

/** Post an alert: category, what is happening, where, and whether to stay anonymous. */
export function NewAlertForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [category, setCategory] = useState<AlertCategory | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [errors, setErrors] = useState<{ category?: string; description?: string; location?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(newIdempotencyKey);

  const elig = useQuery({
    queryKey: ["alert-subscription"],
    queryFn: () => api<{ data: AlertSubscriptionDto }>("/me/alert-subscription").then((r) => r.data),
  });
  const blocked = elig.data ? !elig.data.canPost : false;

  const addressText = (location?.address.trim() ?? "").slice(0, 200);

  const submit = useMutation({
    mutationFn: () =>
      api<{ data: AlertDto }>("/alerts", {
        method: "POST",
        headers: { "Idempotency-Key": attempt },
        body: {
          category,
          description: description.trim(),
          latitude: location!.lat,
          longitude: location!.lng,
          addressText,
          isAnonymous: anonymous,
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      setFlash("Alert posted. It is shown as Unverified.");
      router.push(`/safealert/${res.data.id}`);
    },
    onError: (err) => {
      setAttempt(newIdempotencyKey());
      if (err instanceof ApiError && err.status === 409) {
        setDuplicate(err.message);
        return;
      }
      if (err instanceof ApiError && err.fieldError("latitude")) {
        setErrors({ location: err.fieldError("latitude") ?? err.message });
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "We couldn't post your alert. Try again.");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDuplicate(null);
    const next: typeof errors = {};
    if (!category) next.category = "Choose what is happening.";
    const d = description.trim().length;
    if (d < 10 || d > 500) next.description = "Use 10 to 500 characters.";
    if (!location) next.location = "Drop a pin on the map or search for the place.";
    else if (!addressText) next.location = "Add a street or landmark name in the Address box.";
    setErrors(next);
    if (Object.keys(next).length === 0) submit.mutate();
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <Link
        href="/safealert"
        className="inline-flex min-h-11 items-center text-[14px] leading-5 font-medium text-text-secondary"
      >
        All alerts
      </Link>
      <header>
        <h1 className="type-h1">Post an alert</h1>
        <p className="text-[14px] leading-5 text-text-secondary">Tell people nearby what is happening.</p>
      </header>

      <EmergencyBanner text={CALL_112_LINE} />

      {blocked ? (
        <Banner tone="amber-warn" icon="alert" title="You can't post alerts yet">
          {elig.data?.canPostReason ?? "Posting is not available for your account right now."}
        </Banner>
      ) : null}

      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[14px] leading-5 font-medium">What is happening?</legend>
          <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ALERT_CATEGORY_ORDER.map((c) => (
              <CategoryTile
                key={c}
                icon={ALERT_CATEGORY_META[c].icon}
                label={ALERT_CATEGORY_META[c].label}
                selected={category === c}
                onSelect={() => setCategory(c)}
              />
            ))}
          </div>
          {errors.category ? (
            <p role="alert" className="text-[14px] leading-5 text-coral-text">
              {errors.category}
            </p>
          ) : null}
        </fieldset>

        <TextArea
          label="Describe what you see"
          hint="Facts only: what, where exactly, and whether anyone is hurt."
          maxLength={500}
          counter={{ value: description.length, max: 500 }}
          value={description}
          error={errors.description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <LocationPicker
            value={location}
            onChange={(v) => {
              setLocation(v);
              if (v) setErrors((p) => ({ ...p, location: undefined }));
            }}
          />
          {errors.location ? (
            <p role="alert" className="text-[14px] leading-5 text-coral-text">
              {errors.location}
            </p>
          ) : null}
        </div>

        <Card>
          <Switch
            checked={anonymous}
            onCheckedChange={setAnonymous}
            label="Post anonymously"
            description="Other people never see your name. Moderators can."
          />
        </Card>

        {duplicate ? (
          <Banner tone="amber-warn" icon="alert" title="A similar alert is already nearby">
            {duplicate}{" "}
            <Link
              href="/safealert"
              className="font-semibold underline decoration-amber decoration-2 underline-offset-[3px]"
            >
              Back to alerts
            </Link>
          </Banner>
        ) : null}
        {formError ? (
          <Banner tone="amber-warn" icon="alert">
            {formError}
          </Banner>
        ) : null}

        <Button type="submit" size="mobile" fullWidth loading={submit.isPending} disabled={blocked}>
          Post alert
        </Button>
        <p className="text-[12px] leading-4 text-text-secondary">{HONEST_LINE}</p>
      </form>
    </div>
  );
}
