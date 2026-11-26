// Rate limiting with rate-limiter-flexible on the shared Postgres store (Part 0.4, B5).
// Limits key by user id when signed in, else IP, and answer 429 with Retry-After.
// If the store is unreachable, an in-memory insurance limiter keeps limits per instance.
import type { Request, RequestHandler } from "express";
import type { Pool } from "pg";
import { RateLimiterMemory, RateLimiterPostgres, RateLimiterRes } from "rate-limiter-flexible";
import { RATE_LIMITS, type RateLimitName, type RateLimitRule } from "../config/rateLimits.js";
import { errors } from "../lib/errors.js";
import { sha256Hex } from "../lib/hash.js";

export const RATE_LIMIT_TABLE = "rate_limits";

export type RateLimiters = Record<RateLimitName, RateLimiterPostgres>;

export function createLimiter(pool: Pool, name: string, rule: RateLimitRule): RateLimiterPostgres {
  return new RateLimiterPostgres({
    storeClient: pool,
    storeType: "pool",
    tableName: RATE_LIMIT_TABLE,
    tableCreated: true,
    keyPrefix: name,
    points: rule.points,
    duration: rule.durationSeconds,
    clearExpiredByTimeout: false,
    insuranceLimiter: new RateLimiterMemory({ points: rule.points, duration: rule.durationSeconds }),
  });
}

export function createRateLimiters(
  pool: Pool,
  overrides: Partial<Record<RateLimitName, RateLimitRule>> = {},
): RateLimiters {
  const entries = (Object.keys(RATE_LIMITS) as RateLimitName[]).map((name) => [
    name,
    createLimiter(pool, name, overrides[name] ?? RATE_LIMITS[name]),
  ]);
  return Object.fromEntries(entries) as RateLimiters;
}

export function rateLimitKey(req: Request, key: RateLimitRule["key"]): string {
  if (key === "user" && req.auth) return `u:${req.auth.userId}`;
  if (key === "email") {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    // Hash so raw emails never land in the limiter table.
    return `e:${sha256Hex(email)}`;
  }
  return `ip:${req.ip ?? "unknown"}`;
}

export function rateLimit(
  limiter: RateLimiterPostgres,
  key: RateLimitRule["key"],
  opts: { skip?: (req: Request) => boolean } = {},
): RequestHandler {
  return async (req, res, next) => {
    if (opts.skip?.(req)) return next();
    try {
      const r = await limiter.consume(rateLimitKey(req, key));
      res.setHeader("RateLimit-Remaining", String(r.remainingPoints));
      next();
    } catch (rej) {
      if (rej instanceof RateLimiterRes) {
        return next(errors.rateLimited(Math.max(1, Math.ceil(rej.msBeforeNext / 1000))));
      }
      next(rej);
    }
  };
}
