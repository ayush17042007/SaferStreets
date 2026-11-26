"use client";

import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { fallbackEmergencyNumbers } from "@/config/site";
import type { EmergencyNumber } from "@/components/ui";

/** True when the viewport is at least `px` wide (SSR-safe: false on the server). */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(`(min-width: ${px}px)`);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false,
  );
}

/**
 * Emergency numbers from GET /api/v1/public/emergency-numbers (system_settings).
 * If the API cannot be reached, 112 is still shown so the helper never goes blank.
 */
export function useEmergencyNumbers(provided?: EmergencyNumber[]): EmergencyNumber[] {
  const [fetched, setFetched] = useState<EmergencyNumber[]>([...fallbackEmergencyNumbers]);
  useEffect(() => {
    if (provided) return;
    const ctrl = new AbortController();
    fetch("/api/v1/public/emergency-numbers", { signal: ctrl.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { data?: EmergencyNumber[] }) => {
        if (body.data && body.data.length > 0) setFetched(body.data);
      })
      .catch(() => {
        /* keep the fallback */
      });
    return () => ctrl.abort();
  }, [provided]);
  return provided ?? fetched;
}

/** Never used for real requests: stands in when no QueryClientProvider exists (e.g. /dev/shell). */
const idleClient = new QueryClient();

/**
 * Unread notifications: polls GET /notifications/unread-count every 30 s when a QueryClientProvider
 * exists. `override` (dev/test) wins and switches polling off.
 */
export function useHasUnread(override?: boolean): boolean {
  const client = useContext(QueryClientContext);
  const { data } = useQuery(
    {
      queryKey: ["notifications", "unread-count"],
      queryFn: () => api<{ data: { count: number } }>("/notifications/unread-count"),
      refetchInterval: 30_000,
      enabled: client !== undefined && override === undefined,
      retry: false,
    },
    client ?? idleClient,
  );
  return override ?? (data?.data.count ?? 0) > 0;
}
