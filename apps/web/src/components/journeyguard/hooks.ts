"use client";

import type { EmergencyContactDto, JourneyDto } from "@saferstreets/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const ACTIVE_KEY = ["journey", "active"] as const;

/** My active or overdue journey. Polls so ACTIVE flips to OVERDUE without a reload. */
export const useActiveJourney = () =>
  useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => api<{ data: JourneyDto | null }>("/journeys/active").then((r) => r.data),
    refetchInterval: 30_000,
  });

export const useJourneyById = (id: string) =>
  useQuery({
    queryKey: ["journey", id],
    queryFn: () => api<{ data: JourneyDto }>(`/journeys/${id}`).then((r) => r.data),
    refetchInterval: 30_000,
  });

export const useContacts = () =>
  useQuery({
    queryKey: ["contacts"],
    queryFn: () => api<{ data: EmergencyContactDto[] }>("/me/contacts").then((r) => r.data),
  });

export const useJourneyHistory = () =>
  useInfiniteQuery({
    queryKey: ["journey", "history"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<{ data: JourneyDto[]; meta: { nextCursor: string | null } }>(
        `/journeys/history?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
