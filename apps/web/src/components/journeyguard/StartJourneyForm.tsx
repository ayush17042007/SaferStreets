"use client";

import { startJourneySchema, type EmergencyContactDto, type JourneyDto } from "@saferstreets/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Modal,
  Select,
  Skeleton,
  TextArea,
  TextField,
} from "@/components/ui";
import { ContactForm } from "@/components/profile/ContactsManager";
import { ApiError, api } from "@/lib/api";
import { newKey } from "@/lib/journeyguard";
import { DRAFT_JOURNEY_KEY, type DraftJourneyPayload } from "@/lib/saferoute";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";
import { ACTIVE_KEY, useContacts } from "./hooks";

const NEW = "__new";

function consumeDraftJourney(): DraftJourneyPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_JOURNEY_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_JOURNEY_KEY);
    return JSON.parse(raw) as DraftJourneyPayload;
  } catch {
    return null;
  }
}

/** S16: start a journey. Destination text (map pin optional), expected arrival, trusted contact, note. */
export function StartJourneyForm({ onStarted }: { onStarted: (j: JourneyDto) => void }) {
  const qc = useQueryClient();
  const contacts = useContacts();
  const [draft] = useState<DraftJourneyPayload | null>(() => consumeDraftJourney());
  const [attempt, setAttempt] = useState(newKey);
  const [destination, setDestination] = useState(() => draft?.destinationText?.slice(0, 200) ?? "");
  const [pin, setPin] = useState<PickedLocation | null>(() =>
    draft && typeof draft.destLat === "number" && typeof draft.destLng === "number"
      ? { lat: draft.destLat, lng: draft.destLng, address: draft.destinationText ?? "" }
      : null,
  );
  const [start, setStart] = useState(() => draft?.startText?.slice(0, 200) ?? "");
  const [contactId, setContactId] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(() =>
    draft && typeof draft.startLat === "number" && typeof draft.startLng === "number"
      ? { lat: draft.startLat, lng: draft.startLng }
      : null,
  );
  const [routeGeometry] = useState<Array<[number, number]> | null>(() =>
    draft && Array.isArray(draft.routeGeometry) && draft.routeGeometry.length >= 2 ? draft.routeGeometry : null,
  );
  const [gpsStatus, setGpsStatus] = useState<"idle" | "requesting" | "ready" | "denied" | "unavailable">(() =>
    draft && typeof draft.startLat === "number" && typeof draft.startLng === "number" ? "ready" : "idle",
  );
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);

  const usable = (contacts.data ?? []).filter((c: EmergencyContactDto) => !c.unsubscribed);

  // After a contact is added in the modal, select the new one.
  useEffect(() => {
    if (!contacts.data || adding) return;
    if (known.current) {
      const fresh = contacts.data.find((c) => !known.current!.has(c.id));
      if (fresh) setContactId(fresh.id);
      known.current = null;
    }
  }, [contacts.data, adding]);

  const create = useMutation({
    mutationFn: (body: ReturnType<typeof startJourneySchema.parse>) =>
      api<{ data: JourneyDto }>("/journeys", { method: "POST", body, headers: { "Idempotency-Key": attempt } }),
    onSuccess: async (res) => {
      qc.setQueryData(ACTIVE_KEY, res.data);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onStarted(res.data);
    },
    onError: (err) => {
      setAttempt(newKey());
      if (err instanceof ApiError) {
        if (err.status === 409) void qc.invalidateQueries({ queryKey: ACTIVE_KEY });
        const f = err.details[0];
        if (f) setErrors((e) => ({ ...e, [f.field.split(".").pop() ?? "form"]: f.message }));
        setServerError(err.message);
      } else setServerError("We couldn't start the journey. Try again.");
    },
  });

  function requestGpsPermission() {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      setGpsNote("GPS geolocation is not supported in this browser.");
      return;
    }
    setGpsStatus("requesting");
    setGpsNote("Requesting GPS permission to monitor your route and share your last known location if an alert triggers...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("ready");
        setGpsNote(
          `GPS permission granted (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}). Live updates will run while this journey is active.`,
        );
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setGpsStatus(denied ? "denied" : "unavailable");
        setGpsNote(
          denied
            ? "Location permission was denied. Allow location access in your browser settings for live GPS protection."
            : "GPS signal unavailable right now. Tracking will retry automatically once the journey starts.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function submit() {
    setServerError(null);
    const next: Record<string, string> = {};
    if (!destination.trim()) next.destinationText = "Enter where you are going.";
    if (!contactId) next.emergencyContactId = "Choose who should hear from us if a safety alert triggers.";
    if (Object.keys(next).length === 0) {
      const parsed = startJourneySchema.safeParse({
        destinationText: destination.trim(),
        ...(pin ? { destLat: pin.lat, destLng: pin.lng } : {}),
        ...(start.trim() ? { startText: start.trim() } : {}),
        ...(startCoords ? { startLat: startCoords.lat, startLng: startCoords.lng } : {}),
        trackingEnabled,
        ...(routeGeometry ? { routeGeometry } : {}),
        emergencyContactId: contactId,
        ...(note.trim() ? { notes: note.trim() } : {}),
      });
      if (!parsed.success) {
        for (const i of parsed.error.issues) next[String(i.path[0] ?? "form")] = i.message;
      } else {
        setErrors({});
        create.mutate(parsed.data);
        return;
      }
    }
    setErrors(next);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {serverError ? (
        <Banner tone="coral" icon="error" title="We couldn't start the journey">
          {serverError}
        </Banner>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3">Where to</h2>
        <TextField
          label="Destination"
          placeholder="Hostel gate, library, home"
          maxLength={200}
          value={destination}
          error={errors.destinationText || undefined}
          onChange={(e) => setDestination(e.target.value)}
        />
        <TextField
          label="Starting from"
          optional
          maxLength={200}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <details className="rounded-control border border-line p-3">
          <summary className="min-h-6 cursor-pointer text-[14px] leading-5 font-medium">
            Pin the destination on a map (optional)
          </summary>
          <div className="pt-3">
            <LocationPicker
              label="Destination pin"
              value={pin}
              onChange={(p) => {
                setPin(p);
                if (p && !destination.trim() && p.address.trim()) setDestination(p.address.trim().slice(0, 200));
              }}
            />
          </div>
        </details>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3">Live GPS protection</h2>
        <p className="text-[13px] leading-5 text-text-secondary">
          JourneyGuard uses continuous browser GPS updates while your journey is active to detect route deviations
          (&gt;250 m), prolonged unexpected stops (&ge;5 min), or lost signal — and shares your last known coordinates
          with your trusted contact if an alert triggers.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="mobile"
            loading={gpsStatus === "requesting"}
            onClick={requestGpsPermission}
          >
            {gpsStatus === "ready" ? "GPS location ready" : "Enable GPS location"}
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-[14px] leading-5">
            <input
              type="checkbox"
              checked={trackingEnabled}
              onChange={(e) => {
                setTrackingEnabled(e.target.checked);
                if (e.target.checked && gpsStatus === "idle") requestGpsPermission();
              }}
              className="h-4 w-4 accent-ink"
            />
            <span className="font-medium text-ink">Keep live GPS monitoring active</span>
          </label>
        </div>
        {routeGeometry ? (
          <p className="text-[12px] leading-4 text-mint-text">
            Selected SafeRoute path attached ({routeGeometry.length} waypoints) for deviation monitoring.
          </p>
        ) : null}
        {gpsNote ? <p className="text-[12px] leading-4 text-text-secondary">{gpsNote}</p> : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3">Who should hear from us</h2>
        {contacts.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <Select
            label="Trusted contact"
            placeholder={usable.length ? "Choose a contact" : "Add a contact to continue"}
            value={contactId}
            error={errors.emergencyContactId || undefined}
            options={[
              ...usable.map((c) => ({
                value: c.id,
                label: c.relationship ? `${c.name} (${c.relationship})` : c.name,
              })),
              { value: NEW, label: "Add a new contact" },
            ]}
            onValueChange={(v) => {
              if (v === NEW) {
                known.current = new Set((contacts.data ?? []).map((c) => c.id));
                setAdding(true);
              } else setContactId(v);
            }}
          />
        )}
        <p className="text-[12px] leading-4 text-text-secondary">
          Manage people in{" "}
          <Link href="/journeyguard/contacts" className="font-medium underline">
            trusted contacts
          </Link>
          .
        </p>
        <TextArea
          label="Note"
          optional
          maxLength={300}
          hint="Mode of travel, vehicle number, anything useful."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Card>

      <Banner tone="neutral" icon="alert">
        {trackingEnabled
          ? "Your live GPS location is used only for this active journey and shared with your trusted contact only if you deviate from your route, stop unexpectedly, lose GPS signal, or trigger SOS. SaferStreets cannot dispatch police or ambulance."
          : "Live GPS tracking is off. Your trusted contact will only be notified if you manually trigger SOS."}
      </Banner>

      <Button type="submit" size="hero" loading={create.isPending} fullWidth>
        Start journey
      </Button>

      <Modal open={adding} onOpenChange={setAdding} title="Add a trusted contact">
        <ContactForm onDone={() => setAdding(false)} />
      </Modal>
    </form>
  );
}
