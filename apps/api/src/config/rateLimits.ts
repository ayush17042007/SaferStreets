// Rate-limit defaults from appendix-09 ("Rate limiting (defaults, configurable)").
// Keys: "user" = authenticated user id (falls back to IP), "ip", or "email" (body.email).
// "Rides created: 3 open at once" is a concurrency rule, enforced in the rides service, not here.

export type RateLimitKey = "user" | "ip" | "email";

export interface RateLimitRule {
  points: number;
  durationSeconds: number;
  key: RateLimitKey;
}

export const RATE_LIMITS = {
  /** General API: 120 req/min, keyed by user id when signed in, else IP (Part B5). */
  general: { points: 120, durationSeconds: 60, key: "user" },
  otpRequestPerEmail: { points: 5, durationSeconds: 3600, key: "email" },
  otpRequestPerIp: { points: 20, durationSeconds: 3600, key: "ip" },
  reportCreate: { points: 5, durationSeconds: 86_400, key: "user" },
  rideRequestCreate: { points: 10, durationSeconds: 86_400, key: "user" },
  journeyStart: { points: 3, durationSeconds: 3600, key: "user" },
  alertCreateHourly: { points: 3, durationSeconds: 3600, key: "user" },
  alertCreateDaily: { points: 10, durationSeconds: 86_400, key: "user" },
  geoSearch: { points: 30, durationSeconds: 60, key: "user" },
  geoReverse: { points: 30, durationSeconds: 60, key: "user" },
  flagCreate: { points: 20, durationSeconds: 86_400, key: "user" },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
