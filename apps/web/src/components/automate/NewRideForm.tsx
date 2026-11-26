"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_FARE,
  MAX_LEAD_DAYS,
  MAX_SEATS,
  MIN_FARE,
  MIN_LEAD_MINUTES,
  MIN_ROUTE_METERS,
  MIN_SEATS,
  createRideSchema,
  type RideDetailDto,
} from "@saferstreets/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Banner, Button, Card, DateTimePicker, Icon, TextArea, TextField, cn } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatRupees, istInputToIso, istInputValue, newKey, perPersonPreview } from "@/lib/automate";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";

const MIN_MS = MIN_LEAD_MINUTES * 60_000;
const MAX_MS = MAX_LEAD_DAYS * 24 * 3_600_000;

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const placeField = createRideSchema.shape.source;

// Same limits as the shared create schema; departure is a local (India time) input here and becomes ISO on submit.
const formSchema = z
  .object({
    source: placeField,
    destination: placeField,
    departureLocal: z.string().min(1, "Choose a departure time."),
    seatsTotal: createRideSchema.shape.seatsTotal,
    estimatedTotalFare: z
      .number({ error: `Enter a fare between ${formatRupees(MIN_FARE)} and ${formatRupees(MAX_FARE)}.` })
      .int("Use a whole number of rupees.")
      .min(MIN_FARE, `The fare is at least ${formatRupees(MIN_FARE)}.`)
      .max(MAX_FARE, `The fare is at most ${formatRupees(MAX_FARE)}.`),
    note: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.departureLocal) {
      const t = new Date(istInputToIso(v.departureLocal)).getTime();
      const now = Date.now();
      if (Number.isNaN(t) || t < now + MIN_MS)
        ctx.addIssue({
          code: "custom",
          path: ["departureLocal"],
          message: `Leave at least ${MIN_LEAD_MINUTES} minutes from now.`,
        });
      else if (t > now + MAX_MS)
        ctx.addIssue({
          code: "custom",
          path: ["departureLocal"],
          message: `Rides can be offered up to ${MAX_LEAD_DAYS} days ahead.`,
        });
    }
    if (v.source && v.destination && metersBetween(v.source, v.destination) < MIN_ROUTE_METERS)
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: `Start and end need to be at least ${MIN_ROUTE_METERS} m apart.`,
      });
  });

type FormValues = z.input<typeof formSchema>;

function toPlace(p: PickedLocation | null) {
  return p
    ? { text: p.address.trim() || `Pin at ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, lat: p.lat, lng: p.lng }
    : undefined;
}

/** S11: offer a ride. Two location pickers, departure, seats, total fare with a live per-person preview. */
export default function NewRideForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [attempt, setAttempt] = useState(newKey);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { seatsTotal: 2, note: "" },
  });
  const seats = useWatch({ control, name: "seatsTotal" });
  const fare = useWatch({ control, name: "estimatedTotalFare" });
  const share = typeof fare === "number" && !Number.isNaN(fare) ? perPersonPreview(fare, seats) : null;

  const create = useMutation({
    mutationFn: (v: z.output<typeof formSchema>) => {
      const body = createRideSchema.parse({
        source: v.source,
        destination: v.destination,
        departureAt: istInputToIso(v.departureLocal),
        seatsTotal: v.seatsTotal,
        estimatedTotalFare: v.estimatedTotalFare,
        ...(v.note ? { note: v.note } : {}),
      });
      return api<{ data: RideDetailDto }>("/rides", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": attempt },
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["rides"] });
      void qc.invalidateQueries({ queryKey: ["my-rides"] });
      router.push(`/automate/${res.data.id}?created=1`);
    },
    onError: (err) => {
      setAttempt(newKey());
      if (err instanceof ApiError) {
        const field = err.details[0]?.field;
        const map: Record<string, keyof FormValues> = {
          departureAt: "departureLocal",
          estimatedTotalFare: "estimatedTotalFare",
          seatsTotal: "seatsTotal",
          note: "note",
          destination: "destination",
          source: "source",
        };
        const key = field ? map[field.split(".").pop() ?? ""] : undefined;
        if (key && err.details[0]) setError(key, { message: err.details[0].message });
        setServerError(err.message);
      } else setServerError("We couldn't offer that ride. Try again.");
    },
  });

  return (
    <form
      noValidate
      className="mx-auto flex max-w-2xl flex-col gap-5"
      onSubmit={handleSubmit((v) => {
        setServerError(null);
        create.mutate(v as z.output<typeof formSchema>);
      })}
    >
      <Link
        href="/automate"
        className="inline-flex min-h-11 items-center gap-1 text-[14px] leading-5 font-medium text-text-secondary"
      >
        <Icon name="back" size={16} />
        All rides
      </Link>
      <header>
        <h1 className="type-h1">Offer a ride</h1>
        <p className="text-[14px] leading-5 text-text-secondary">
          Offer the spare seats in an auto you are already taking. Fare is shared between riders in cash, outside
          SaferStreets.
        </p>
      </header>

      {serverError ? (
        <Banner tone="coral" icon="error" title="We couldn't offer the ride">
          {serverError}
        </Banner>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3">Route</h2>
        <Controller
          control={control}
          name="source"
          render={({ field }) => (
            <PlaceBlock
              label="Starting point"
              error={errors.source ? "Choose where the ride starts." : undefined}
              onPick={(p) => field.onChange(toPlace(p))}
              initial={null}
            />
          )}
        />
        <Controller
          control={control}
          name="destination"
          render={({ field }) => (
            <PlaceBlock
              label="Destination"
              error={errors.destination ? (errors.destination.message ?? "Choose where the ride ends.") : undefined}
              onPick={(p) => field.onChange(toPlace(p))}
              initial={null}
            />
          )}
        />
        <p className="text-[12px] leading-4 text-text-secondary">
          Start and end need to be at least {MIN_ROUTE_METERS} m apart.
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3">When and how many</h2>
        <DateTimePicker
          label="Departure (India time)"
          min={istInputValue(MIN_MS)}
          max={istInputValue(MAX_MS)}
          hint={`From ${MIN_LEAD_MINUTES} minutes to ${MAX_LEAD_DAYS} days from now.`}
          error={errors.departureLocal?.message}
          {...register("departureLocal")}
        />
        <Controller
          control={control}
          name="seatsTotal"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[14px] leading-5 font-medium">Seats you are offering</legend>
              <div role="radiogroup" aria-label="Seats you are offering" className="flex gap-2">
                {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={field.value === n}
                    onClick={() => field.onChange(n)}
                    className={cn(
                      "inline-flex h-11 w-14 items-center justify-center rounded-control border text-[14px] leading-5 font-medium",
                      field.value === n
                        ? "border-ink bg-ink text-white"
                        : "border-line-control bg-card text-ink hover:bg-neutral-bubble",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3">Fare</h2>
        <TextField
          label="Total fare for the auto (INR)"
          type="number"
          inputMode="numeric"
          min={MIN_FARE}
          max={MAX_FARE}
          step={1}
          hint={`Your best estimate, ${formatRupees(MIN_FARE)} to ${formatRupees(MAX_FARE)}.`}
          error={errors.estimatedTotalFare?.message}
          {...register("estimatedTotalFare", { valueAsNumber: true })}
        />
        <p className="text-[14px] leading-5" data-testid="fare-preview" aria-live="polite">
          {share !== null && share > 0 ? (
            <>
              About <span className="font-display font-semibold">{formatRupees(share)}</span> each. The fare is split
              across {seats + 1} people because you pay a share too.
            </>
          ) : (
            <span className="text-text-secondary">Enter the total to see each person&apos;s share.</span>
          )}
        </p>
        <p className="text-[12px] leading-4 text-text-secondary">
          Riders pay you or the driver in cash. SaferStreets does not handle payments.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <TextArea
          label="Note"
          optional
          maxLength={300}
          hint="Meeting point, luggage, anything riders should know."
          error={errors.note?.message}
          {...register("note")}
        />
      </Card>

      <Button type="submit" size="hero" loading={create.isPending} fullWidth>
        Offer ride
      </Button>
    </form>
  );
}

function PlaceBlock({
  label,
  error,
  onPick,
  initial,
}: {
  label: string;
  error: string | undefined;
  onPick: (p: PickedLocation | null) => void;
  initial: PickedLocation | null;
}) {
  const [value, setValue] = useState<PickedLocation | null>(initial);
  return (
    <div className="flex flex-col gap-1">
      <LocationPicker
        label={label}
        value={value}
        onChange={(p) => {
          setValue(p);
          onPick(p);
        }}
      />
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-[14px] leading-5 text-coral-text">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
