"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page } from "./kit";

/** Cursor-paginated GET list under /admin. `params` are query-string values; empty ones are dropped. */
export function useAdminList<T>(path: string, params: Record<string, string | undefined>) {
  const q = useInfiniteQuery({
    queryKey: ["admin", path, params],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ limit: "20" });
      for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
      if (pageParam) sp.set("cursor", pageParam);
      return api<Page<T>>(`${path}?${sp.toString()}`);
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  return { query: q, items: q.data?.pages.flatMap((p) => p.data) ?? [] };
}
