// Session model (appendix-09): 256-bit random token, only its HMAC is stored, httpOnly cookie,
// 30-day sliding expiry, a fresh token on every login (rotation).
import type { CookieOptions, Response } from "express";
import type { Env } from "../../config/env.js";
import { generateToken } from "../../lib/crypto.js";
import type { Clock } from "../../lib/clock.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { SESSION_COOKIE, SESSION_WINDOW_MS, hashSessionToken } from "../../middleware/auth.js";

export const SESSION_MS = SESSION_WINDOW_MS;

export function sessionCookieOptions(env: Pick<Env, "APP_ORIGIN">, expires: Date): CookieOptions {
  return {
    httpOnly: true,
    // Secure whenever the site is served over https; plain http://localhost keeps working in development.
    secure: env.APP_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires,
  };
}

export function setSessionCookie(res: Response, env: Pick<Env, "APP_ORIGIN">, token: string, expires: Date): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(env, expires));
}

export function clearSessionCookie(res: Response, env: Pick<Env, "APP_ORIGIN">): void {
  const opts = sessionCookieOptions(env, new Date(0));
  delete opts.expires;
  res.clearCookie(SESSION_COOKIE, opts);
}

export async function createSession(
  deps: { prisma: PrismaClient; env: Pick<Env, "SESSION_SECRET">; clock: Clock },
  input: { userId: string; userAgent?: string | undefined; ip?: string | undefined },
): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = generateToken();
  const expiresAt = new Date(deps.clock.now().getTime() + SESSION_MS);
  const row = await deps.prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashSessionToken(deps.env.SESSION_SECRET, token),
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      ip: input.ip?.slice(0, 45) ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt, id: row.id };
}
