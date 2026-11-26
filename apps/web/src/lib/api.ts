// Browser-side API client. Same origin (/api/* is rewritten to Express), so the session cookie rides along.
import type { ErrorCode } from "@saferstreets/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly details: Array<{ field: string; message: string }> = [],
    readonly meta: Record<string, unknown> = {},
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** First message for a form field, e.g. fieldError("body.fullName"). */
  fieldError(field: string): string | undefined {
    return this.details.find((d) => d.field === field || d.field.endsWith(`.${field}`))?.message;
  }
}

const BASE = "/api/v1";

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest",
        ...init.headers,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "We couldn't reach SaferStreets. Check your connection and try again.");
  }
  if (res.ok) return (await res.json()) as T;
  let body: {
    error?: { code?: ErrorCode; message?: string; details?: ApiError["details"]; meta?: Record<string, unknown> };
  } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const retry = Number(res.headers.get("retry-after"));
  throw new ApiError(
    res.status,
    body.error?.code ?? "INTERNAL",
    body.error?.message ?? "Something went wrong on our side. Try again.",
    body.error?.details ?? [],
    body.error?.meta ?? {},
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}
