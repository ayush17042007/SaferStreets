// SSR data fetching (Part B2): server components call the API directly at API_ORIGIN and
// forward the visitor's cookies so the request is made as that visitor.
import "server-only";
import { cookies } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

export function apiUrl(path: string): string {
  if (!path.startsWith("/api/")) throw new Error(`serverFetch paths must start with /api/ (got ${path})`);
  return `${API_ORIGIN}${path}`;
}

export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
  const headers = new Headers(init.headers);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  headers.set("x-requested-with", "XMLHttpRequest");
  headers.set("accept", "application/json");
  return fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
}
