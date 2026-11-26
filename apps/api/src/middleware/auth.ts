// Session lookup and authorization guards (appendix-07 7.3, appendix-09 Sessions).
// Sessions are issued in Prompt 4; this reads them. Only the HMAC of the token is stored.
import type { RequestHandler, Response } from "express";
import type { UserRole } from "@saferstreets/shared";
import { errors } from "../lib/errors.js";
import { hmacHex } from "../lib/hash.js";
import type { Clock } from "../lib/clock.js";
import type { PrismaClient } from "../lib/prisma.js";

export const SESSION_COOKIE = "ss_session";
export const SESSION_WINDOW_MS = 30 * 24 * 3600 * 1000;
export const SESSION_REFRESH_MS = 24 * 3600 * 1000;

export function hashSessionToken(secret: string, token: string): string {
  return hmacHex(secret, token);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Attaches req.auth when the session cookie is valid (not revoked, not expired, user ACTIVE).
 * Never rejects on its own; guards below decide. Runs before rate limiting so limits key by user.
 */
export function attachSession(deps: {
  prisma: PrismaClient;
  sessionSecret: string;
  clock: Clock;
  /** Re-sets the cookie when the sliding expiry is extended. */
  refreshCookie?: (res: Response, token: string, expires: Date) => void;
}): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      if (!token || token.length > 256) return next();
      const session = await deps.prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(deps.sessionSecret, token) },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          user: { select: { id: true, role: true, status: true, deletedAt: true } },
        },
      });
      if (!session || session.revokedAt || session.expiresAt <= deps.clock.now() || session.user.deletedAt) {
        return next();
      }
      if (session.user.status === "SUSPENDED") req.authRejection = "suspended";
      else if (session.user.status === "BANNED") req.authRejection = "banned";
      else if (session.user.status === "ACTIVE") {
        req.auth = { userId: session.user.id, role: session.user.role, sessionId: session.id };
        // 30-day sliding expiry: extend at most once a day.
        const now = deps.clock.now();
        if (session.expiresAt.getTime() - now.getTime() < SESSION_WINDOW_MS - SESSION_REFRESH_MS) {
          const expires = new Date(now.getTime() + SESSION_WINDOW_MS);
          await deps.prisma.session.update({ where: { id: session.id }, data: { expiresAt: expires } });
          deps.refreshCookie?.(res, token, expires);
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.auth) return next();
  if (req.authRejection === "suspended") return next(errors.forbidden("Your account is suspended."));
  if (req.authRejection === "banned") return next(errors.forbidden("Your account has been closed."));
  next(errors.unauthenticated());
};

const RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };

/** requireRole('MODERATOR') also admits ADMIN (admin implied). Use after requireAuth. */
export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(errors.unauthenticated());
    if (RANK[req.auth.role] < RANK[role]) return next(errors.forbidden());
    next();
  };
}
