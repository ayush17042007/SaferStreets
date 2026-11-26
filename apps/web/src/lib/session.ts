// Server-side session helpers: read the visitor's profile through the API, forwarding their cookies.
import "server-only";
import type { MeResponse } from "@saferstreets/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverFetch } from "./server-fetch";

/** The signed-in user, or null when there is no valid session. Throws for anything unexpected. */
export async function getMe(): Promise<MeResponse | null> {
  const res = await serverFetch("/api/v1/me");
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`GET /me answered ${res.status}`);
  return ((await res.json()) as { data: MeResponse }).data;
}

/** Only same-site relative paths are allowed as a `?next=` return target (no open redirects). */
export function safeNext(next: string | undefined | null, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/verify")) return fallback;
  return next;
}

export async function currentPath(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") ?? "/dashboard";
}

/** For protected layouts: redirect to /login?next=<current path> when there is no session. */
export async function requireMe(): Promise<MeResponse> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(await currentPath())}`);
  return me;
}

/** Like getMe, but an unreachable API counts as "not signed in" (so /login still renders). */
export async function getMeOrNull(): Promise<MeResponse | null> {
  try {
    return await getMe();
  } catch {
    return null;
  }
}
