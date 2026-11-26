"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createSosAlarm, type SosAlarmController, type SosAudioStatus } from "@/lib/sos-alarm";

export interface SosContextValue {
  active: boolean;
  audioStatus: SosAudioStatus;
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
  const alarmRef = useRef<SosAlarmController | null>(null);
  const startingRef = useRef(false);

  const getAlarm = useCallback(() => {
    if (!alarmRef.current) alarmRef.current = createAlarm();
    return alarmRef.current;
  }, [createAlarm]);

  const stop = useCallback(() => {
    startingRef.current = false;
    alarmRef.current?.stop();
    setActive(false);
    setAudioStatus("idle");
  }, []);

  const activate = useCallback(async () => {
    if (active || startingRef.current) return;
    startingRef.current = true;
    try {
      const status = await getAlarm().start();
      if (!startingRef.current) {
        alarmRef.current?.stop();
        return;
      }
      setActive(true);
      setAudioStatus(status);
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

  return <SosContext.Provider value={{ active, audioStatus, activate, stop }}>{children}</SosContext.Provider>;
}

export function useSos(): SosContextValue {
  const ctx = useContext(SosContext);
  if (!ctx) throw new Error("useSos must be used inside SosProvider");
  return ctx;
}

export function useSosOptional(): SosContextValue | null {
  return useContext(SosContext);
}
