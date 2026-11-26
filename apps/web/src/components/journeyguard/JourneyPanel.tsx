"use client";

import type { JourneyDto, JourneySafetyState } from "@saferstreets/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSos } from "@/components/sos/SosProvider";
import { Banner, Button, Card, ConfirmDialog, CountdownRing, Icon, Modal, StatusChip, useToast } from "@/components/ui";
import { lightColors } from "@/design/tokens";
import { ApiError, api } from "@/lib/api";
import { formatClock, formatDateTime, recordJourneyLocation, triggerJourneySos } from "@/lib/journeyguard";
import { MapView, type MapRoute } from "@/map/MapView";
import type { MapPoint } from "@/map/markers";
import { ACTIVE_KEY, useContacts } from "./hooks";

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Status chip text; status is never colour alone. */
export function JourneyStatusChip({ status }: { status: JourneyDto["status"] }) {
  if (status === "OVERDUE") return <StatusChip tone="amber" label="Past arrival time" icon="clock" />;
  if (status === "COMPLETED") return <StatusChip tone="mint" label="Arrived safely" icon="check" />;
  if (status === "CANCELLED") return <StatusChip tone="neutral" label="Cancelled" />;
  return <StatusChip status="Active journey" icon="journeyguard" />;
}

export function SafetyStateChip({ state }: { state: JourneySafetyState }) {
  if (state === "SOS") return <StatusChip tone="coral" label="SOS active" icon="emergency" />;
  if (state === "LOST_SIGNAL") return <StatusChip tone="coral" label="Signal paused" icon="alert" />;
  if (state === "DEVIATED") return <StatusChip tone="amber" label="Off planned route" icon="alert" />;
  if (state === "STOPPED") return <StatusChip tone="amber" label="Extended stop" icon="clock" />;
  return <StatusChip tone="mint" label="Monitoring normal" icon="check" />;
}

/**
 * S17: one journey. Live (ACTIVE or OVERDUE) journeys get the countdown, honest-limits line and actions;
 * finished ones are read-only.
 */
export function JourneyPanel({ journey: j }: { journey: JourneyDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sosCtx = useSos();
  const now = useNow();
  const contacts = useContacts();
  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "watching" | "denied" | "unavailable" | "offline">("idle");
  const lastSentRef = useRef<number>(0);

  const live = j.status === "ACTIVE" || j.status === "OVERDUE";

  // Live geolocation updates while journey is active & trackingEnabled.
  useEffect(() => {
    if (!live || !j.trackingEnabled || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!navigator.onLine) {
          setGpsState("offline");
          return;
        }
        setGpsState("watching");
        const ts = Date.now();
        if (ts - lastSentRef.current < 30_000) return;
        lastSentRef.current = ts;
        void recordJourneyLocation(j.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          ...(typeof pos.coords.accuracy === "number" ? { accuracyM: pos.coords.accuracy } : {}),
          ...(typeof pos.coords.speed === "number" && pos.coords.speed >= 0 ? { speedMps: pos.coords.speed } : {}),
        })
          .then((updated) => {
            qc.setQueryData(ACTIVE_KEY, updated);
          })
          .catch(() => {
            /* transient network error; next interval will retry */
          });
      },
      (err) => {
        setGpsState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [live, j.id, j.trackingEnabled, qc]);
  const overdue = j.status === "OVERDUE";
  const name = j.contact?.name ?? "your contact";
  const phone = j.contact ? contacts.data?.find((c) => c.id === j.contact!.id)?.phone : null;
  const emailFailed = j.contactEmailFailed || j.contactOptedOut;

  const eta = new Date(j.expectedArrivalAt).getTime();
  const minutesLeft = Math.max(0, Math.ceil((eta - now) / 60_000));
  const totalMinutes = Math.max(1, Math.round((eta - new Date(j.startedAt).getTime()) / 60_000));

  const done = async (message: string) => {
    await qc.invalidateQueries({ queryKey: ["journey"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.show(message);
  };
  const fail = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    setExtendOpen(false);
    setCancelOpen(false);
    void qc.invalidateQueries({ queryKey: ACTIVE_KEY });
  };

  const complete = useMutation({
    mutationFn: () => api(`/journeys/${j.id}/complete`, { method: "POST" }),
    onSuccess: () => done("Marked as arrived. Journey ended."),
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: () => api(`/journeys/${j.id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      setCancelOpen(false);
      return done("Journey cancelled.");
    },
    onError: fail,
  });
  const extend = useMutation({
    mutationFn: (minutes: 15 | 30) => api(`/journeys/${j.id}/extend`, { method: "POST", body: { minutes } }),
    onSuccess: (_r, minutes) => {
      setExtendOpen(false);
      return done(`Arrival time moved ${minutes} minutes later.`);
    },
    onError: fail,
  });

  const sos = useMutation({
    mutationFn: () => triggerJourneySos(j.id),
    onSuccess: (res) => {
      qc.setQueryData(ACTIVE_KEY, res.journey);
      if (!sosCtx.active) void sosCtx.activate();
      toast.show(`SOS triggered. ${name} has been notified. Call ${res.emergencyNumber} if in immediate danger.`);
    },
    onError: fail,
  });

  const mapPoints = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [];
    if (j.lastLat !== null && j.lastLng !== null) {
      pts.push({ id: "live", kind: "live", lat: j.lastLat, lng: j.lastLng, label: "Your live position" });
    }
    if (j.destLat !== null && j.destLng !== null) {
      pts.push({ id: "dest", kind: "ride", lat: j.destLat, lng: j.destLng, label: j.destinationText });
    }
    return pts;
  }, [j.lastLat, j.lastLng, j.destLat, j.destLng, j.destinationText]);

  const mapRoutes = useMemo<MapRoute[]>(() => {
    if (!j.routeGeometry || j.routeGeometry.length < 2) return [];
    return [{ id: "planned", coordinates: j.routeGeometry, color: lightColors.ink, selected: true }];
  }, [j.routeGeometry]);

  const extendBlock = j.contactNotifiedAt
    ? `${name} has already been emailed, so the time can't be moved.`
    : j.extensionsLeft <= 0
      ? "You've used both extensions for this journey."
      : null;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Banner tone="coral" icon="error">
          {error}
        </Banner>
      ) : null}

      {overdue ? (
        <Banner tone="amber-warn" icon="clock" title="Have you arrived?">
          Your expected arrival time has passed. Confirm below once you are safe.
          {j.contactNotifiedAt && !emailFailed ? <p className="mt-1 font-medium">We emailed {name}.</p> : null}
        </Banner>
      ) : null}

      {live && j.safetyState !== "NORMAL" ? (
        <Banner
          tone={j.safetyState === "SOS" || j.safetyState === "LOST_SIGNAL" ? "coral" : "amber-warn"}
          icon={j.safetyState === "SOS" ? "emergency" : "alert"}
          title={
            j.safetyState === "SOS"
              ? "SOS active for this journey"
              : j.safetyState === "DEVIATED"
                ? "Route deviation detected"
                : j.safetyState === "STOPPED"
                  ? "Extended stop detected"
                  : "Location updates paused"
          }
        >
          {j.safetyState === "SOS"
            ? `Your trusted contact (${name}) has been notified with your last known location. SaferStreets cannot call 112 automatically — tap Call 112 below if you need emergency services.`
            : j.safetyState === "DEVIATED"
              ? `You moved more than 250 m off your planned route. ${name} has been notified.`
              : j.safetyState === "STOPPED"
                ? `You have been stationary for at least 5 minutes. ${name} has been notified.`
                : "No GPS update received for over 5 minutes. Keep this tab open and check your connection."}
        </Banner>
      ) : null}

      {live && emailFailed ? (
        <Banner
          tone="coral"
          icon="emergency"
          title={`We couldn't email ${name}. Call them directly.`}
          action={
            phone ? (
              <Button asChild variant="secondary" size="mobile">
                <a href={`tel:${phone}`}>Call {name}</a>
              </Button>
            ) : undefined
          }
        >
          {j.contactOptedOut ? `${name} asked to stop getting these emails.` : "The email did not go through."}
        </Banner>
      ) : null}

      <Card border={overdue ? "amber-warn-border" : "periwinkle-border"} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <JourneyStatusChip status={j.status} />
            {live && j.trackingEnabled ? <SafetyStateChip state={j.safetyState} /> : null}
          </div>
          <span className="text-[12px] leading-4 text-text-secondary">
            Arrive by {formatClock(j.expectedArrivalAt, now)}
          </span>
        </div>

        <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-6">
          {live ? (
            <CountdownRing minutesLeft={minutesLeft} totalMinutes={totalMinutes} overdue={overdue} size={140} />
          ) : null}
          <div className="min-w-0 flex-1 text-center md:text-left">
            <h2 className="type-h2 break-words">
              {j.startText ? `${j.startText} to ${j.destinationText}` : `To ${j.destinationText}`}
            </h2>
            <p className="text-[14px] leading-5 text-text-secondary">
              Expected {formatDateTime(j.expectedArrivalAt)} IST
              {j.extensionsUsed > 0 ? ` · extended ${j.extensionsUsed} time${j.extensionsUsed === 1 ? "" : "s"}` : ""}
            </p>
            {j.notes ? <p className="mt-1 text-[14px] leading-5">{j.notes}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-control border border-line p-3">
          <Icon name="mail" size={20} className="shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <p className="text-[14px] leading-5 font-medium">
              {name}
              {j.contact?.relationship ? (
                <span className="font-normal text-text-secondary"> · {j.contact.relationship}</span>
              ) : null}
            </p>
            <p className="text-[12px] leading-4 text-text-secondary">Your trusted contact for this journey.</p>
          </div>
        </div>

        {live ? (
          <p className="text-[14px] leading-5 text-text-secondary" data-testid="honest-limits">
            {j.trackingEnabled ? (
              <>
                Live GPS tracking is active while this tab stays open ({gpsState === "watching" ? "sending updates" : gpsState === "denied" ? "GPS permission denied" : gpsState === "offline" ? "offline — will retry" : gpsState === "unavailable" ? "GPS unavailable" : "initializing"}). If you haven&apos;t confirmed by{" "}
                {formatClock(j.overdueAfterAt, now)}, we remind you. Closing the browser or locking your screen pauses web GPS.
              </>
            ) : (
              <>
                If you haven&apos;t confirmed by {formatClock(j.overdueAfterAt, now)}, we remind you. If still nothing by{" "}
                {formatClock(j.escalationAt, now)}, we email {name} once. Live location tracking is off.
              </>
            )}
          </p>
        ) : null}

        {live && j.trackingEnabled && (mapPoints.length > 0 || mapRoutes.length > 0) ? (
          <MapView points={mapPoints} routes={mapRoutes} label="Live journey map" />
        ) : null}

        {live ? (
          <div className="flex flex-col gap-3">
            <Button size="hero" fullWidth loading={complete.isPending} onClick={() => complete.mutate()}>
              I&apos;ve arrived safely
            </Button>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                size="mobile"
                disabled={extendBlock !== null}
                aria-describedby={extendBlock ? "extend-reason" : undefined}
                onClick={() => setExtendOpen(true)}
              >
                Extend ETA
              </Button>
              <Button variant="secondary" size="mobile" onClick={() => setCancelOpen(true)}>
                Cancel journey
              </Button>
            </div>
            {extendBlock ? (
              <p id="extend-reason" className="text-[12px] leading-4 text-text-secondary">
                {extendBlock}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {live ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3">If you are in danger</h2>
          <p className="text-[14px] leading-5 text-text-secondary">
            SaferStreets is not an emergency service and can&apos;t send help. Call 112 first.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="emergency-solid"
              size="mobile"
              loading={sos.isPending}
              disabled={j.safetyState === "SOS"}
              onClick={() => sos.mutate()}
            >
              <Icon name="emergency" size={18} className="mr-2" />
              {j.safetyState === "SOS" ? "SOS active" : "Trigger SOS"}
            </Button>
            <Button asChild variant="secondary" size="mobile">
              <a href="tel:112">Call 112</a>
            </Button>
            {phone ? (
              <Button asChild variant="secondary" size="mobile">
                <a href={`tel:${phone}`}>Call {name}</a>
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Modal
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title="Extend arrival time"
        description={`You can extend ${j.extensionsLeft} more time${j.extensionsLeft === 1 ? "" : "s"}. The reminder and the email to ${name} move with it.`}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          {([15, 30] as const).map((m) => (
            <Button
              key={m}
              variant="secondary"
              size="mobile"
              loading={extend.isPending && extend.variables === m}
              disabled={extend.isPending}
              onClick={() => extend.mutate(m)}
            >
              Add {m} minutes
            </Button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this journey?"
        description={`${name} won't be emailed about it.`}
        confirmLabel="Cancel journey"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
