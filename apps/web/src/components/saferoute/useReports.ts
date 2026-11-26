"use client";

import type { ReportCardDto } from "@saferstreets/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ListResponse {
  data: ReportCardDto[];
  meta: { nextCursor: string | null };
}

export interface ReportFilters {
  category?: string;
  status?: string;
  mine?: boolean;
}

/** Cursor-paged GET /reports. */
export function useReports(filters: ReportFilters) {
  const query = useInfiniteQuery({
    queryKey: ["reports", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (filters.category) qs.set("category", filters.category);
      if (filters.status) qs.set("status", filters.status);
      if (filters.mine) qs.set("mine", "true");
      if (pageParam) qs.set("cursor", pageParam);
      return api<ListResponse>(`/reports?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const reports = query.data?.pages.flatMap((p) => p.data) ?? [];
  return { ...query, reports };
}
