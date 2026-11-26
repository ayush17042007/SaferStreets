"use client";

import type { SosEventDto } from "@saferstreets/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import { createSosAlarm, type SosAlarmController, type SosAudioStatus } from "@/lib/sos-alarm";

export interface NearbyEmergencyPlace {
  label: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

export interface NearbyEmergencyServices {
  police: NearbyEmergencyPlace[];
  ambulance: NearbyEmergencyPlace[];
  fire: NearbyEmergencyPlace[];
}

export interface SosContextValue {
  active: boolean;
  audioStatus: SosAudioStatus;
  sosEvent: SosEventDto | null;
  sosBusy: boolean;
  sosError: string | null;
  nearbyServices: NearbyEmergencyServices | null;
  activate: () => Promise<void>;
  stop: () => void;
}

const SosContext = createContext<SosContextValue | null>(null);

export function SosProvider({
  children,
  createAlarm = createSosAlarm,
}: {
  children: ReactNode;
  createAlarm?: () => SosAlarmController;
}) {
  const [active, setActive] = useState(false);
  const [audioStatus, setAudioStatus] = useState<SosAudioStatus>("idle");
  const [sosEvent, setSosEvent] = useState<SosEventDto | null>(null);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosError, setSosError] = useState<string | null>(null);
  const [nearbyServices, setNearbyServices] = useState<NearbyEmergencyServices | null>(null);
  const alarmRef = useRef<SosAlarmController | null>(null);
  const startingRef = useRef(false);

  const getAlarm = useCallback(() => {
    if (!alarmRef.current) alarmRef.current = createAlarm();
    return alarmRef.current;
  }, [createAlarm]);

  const stop = useCallback(() => {
    startingRef.current = false;
    alarmRef.current?.stop();
    const currentId = sosEvent?.id;
    setActive(false);
    setAudioStatus("idle");
    setSosEvent(null);
    setSosError(null);
    setNearbyServices(null);
    if (currentId) {
      void api(`/sos/${currentId}/resolve`, { method: "POST" }).catch(() => {
        /* best-effort resolve */
      });
    }
  }, [sosEvent?.id]);

  const activate = useCallback(async () => {
    if (active || startingRef.current) return;
    startingRef.current = true;
    setSosError(null);
    try {
      const status = await getAlarm().start();
      if (!startingRef.current) {
        alarmRef.current?.stop();
        return;
      }
      setActive(true);
      setAudioStatus(status);

      if (typeof navigator !== "undefined" && "geolocation" in navigator) {
        setSosBusy(true);
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const idempotencyKey =
                typeof globalThis.crypto?.randomUUID === "function"
                  ? globalThis.crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`;
              const created = await api<{ data: SosEventDto }>("/sos", {
                method: "POST",
                headers: { "Idempotency-Key": idempotencyKey },
                body: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, radiusKm: 3 },
              });
              setSosEvent(created.data);
              const svc = await api<{ data: NearbyEmergencyServices }>(
                `/geo/emergency-services?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
              ).catch(() => null);
              if (svc?.data) setNearbyServices(svc.data);
            } catch (err) {
              setSosError(
                err instanceof ApiError ? err.message : "Could not send nearby SOS notifications right now.",
              );
            } finally {
              setSosBusy(false);
            }
          },
          () => {
            setSosBusy(false);
            setSosError("GPS location unavailable or denied. Local alarm is active, but nearby users were not notified.");
          },
          { enableHighAccuracy: true, timeout: 10_000 },
        );
      }
    } finally {
      startingRef.current = false;
    }
  }, [active, getAlarm]);

  useEffect(() => {
    const onPageHide = () => {
      alarmRef.current?.stop();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      alarmRef.current?.stop();
    };
  }, []);

  return (
    <SosContext.Provider value={{ active, audioStatus, sosEvent, sosBusy, sosError, nearbyServices, activate, stop }}>
      {children}
    </SosContext.Provider>
  );
}

export function useSos(): SosContextValue {
  const ctx = useContext(SosContext);
  if (!ctx) throw new Error("useSos must be used inside SosProvider");
  return ctx;
}

export function useSosOptional(): SosContextValue | null {
  return useContext(SosContext);
}
