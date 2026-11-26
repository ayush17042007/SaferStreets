// OTP login (appendix-09, appendix-05 5.1). See docs/plans/prompt-04-auth.md for the state machine.
import { timingSafeEqual } from "node:crypto";
import { OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS, OTP_REQUEST_MESSAGE, OTP_RESEND_SECONDS } from "@saferstreets/shared";
import type { Env } from "../../config/env.js";
import type { Clock } from "../../lib/clock.js";
import { generateOtpCode } from "../../lib/crypto.js";
import { errors } from "../../lib/errors.js";
import { hmacHex } from "../../lib/hash.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { EmailService } from "../mail/email.service.js";
import { createSession } from "./session.js";
import type { TurnstileVerifier } from "./turnstile.js";

export interface AuthDeps {
  prisma: PrismaClient;
  env: Env;
  clock: Clock;
  email: EmailService;
  turnstile: TurnstileVerifier;
  log: Logger;
}

export function createAuthService(deps: AuthDeps) {
  const { prisma, env, clock } = deps;
  const hashCode = (email: string, code: string) => hmacHex(env.OTP_HMAC_SECRET, `${email}:${code}`);

  async function requestCode(input: { email: string; turnstileToken: string; ip: string | undefined }) {
    const human = await deps.turnstile.verify(input.turnstileToken, input.ip);
    if (!human) throw errors.validation([{ field: "turnstileToken", message: "Complete the check and try again." }]);

    const now = clock.now();
    const latest = await prisma.otpCode.findFirst({ where: { email: input.email }, orderBy: { createdAt: "desc" } });
    const sinceLatest = latest ? now.getTime() - latest.createdAt.getTime() : Infinity;
    // Inside the cooldown: send nothing, answer exactly as if we had. Does not depend on the account.
    if (sinceLatest < OTP_RESEND_SECONDS * 1000) {
      const left = Math.min(OTP_RESEND_SECONDS, Math.ceil((OTP_RESEND_SECONDS * 1000 - sinceLatest) / 1000));
      return { message: OTP_REQUEST_MESSAGE, resendAfterSeconds: left };
    }

    const code = generateOtpCode();
    await prisma.$transaction([
      // Only the newest valid code works: retire any older unused ones.
      prisma.otpCode.updateMany({ where: { email: input.email, consumedAt: null }, data: { consumedAt: now } }),
      prisma.otpCode.create({
        data: {
          email: input.email,
          codeHash: hashCode(input.email, code),
          // Explicit so the cooldown and expiry use the injected clock, not the database clock.
          createdAt: now,
          expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000),
          ip: input.ip?.slice(0, 45) ?? null,
        },
      }),
    ]);
    // Created for ANY well-formed address (known or not) so both look identical from outside.
    await deps.email.sendOtp(input.email, code);
    return { message: OTP_REQUEST_MESSAGE, resendAfterSeconds: OTP_RESEND_SECONDS };
  }

  async function verifyCode(input: {
    email: string;
    code: string;
    ip: string | undefined;
    userAgent: string | undefined;
  }) {
    const now = clock.now();
    const row = await prisma.otpCode.findFirst({ where: { email: input.email }, orderBy: { createdAt: "desc" } });
    // No code, or already used or retired: same answer as a wrong code.
    if (!row || row.consumedAt) throw errors.otpInvalid();
    if (row.expiresAt <= now) throw errors.otpExpired();
    if (row.attempts >= OTP_MAX_ATTEMPTS) throw errors.otpLocked();

    const given = Buffer.from(hashCode(input.email, input.code), "hex");
    const stored = Buffer.from(row.codeHash, "hex");
    const match = given.length === stored.length && timingSafeEqual(given, stored);

    if (!match) {
      // Atomic increment guarded by the limit, so parallel guesses cannot exceed 5.
      const updated = await prisma.otpCode.updateMany({
        where: { id: row.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count === 0) throw errors.otpLocked();
      const left = OTP_MAX_ATTEMPTS - (row.attempts + 1);
      if (left <= 0) throw errors.otpLocked();
      throw errors.otpInvalid(left);
    }

    // Single use: only one request can flip consumed_at.
    const consumed = await prisma.otpCode.updateMany({
      where: { id: row.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) throw errors.otpInvalid();

    let user = await prisma.user.findUnique({ where: { email: input.email } });
    if (user && (user.deletedAt || user.status !== "ACTIVE")) {
      // Deleted, suspended and banned accounts cannot log in, and look like a wrong code.
      throw errors.otpInvalid();
    }
    if (!user) {
      user = await prisma.user.create({ data: { email: input.email, emailVerifiedAt: now, lastLoginAt: now } });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, emailVerifiedAt: user.emailVerifiedAt ?? now },
      });
    }

    const session = await createSession(
      { prisma, env, clock },
      { userId: user.id, userAgent: input.userAgent, ip: input.ip },
    );
    return { session, needsOnboarding: !user.fullName || !user.termsAcceptedAt };
  }

  async function logout(sessionId: string) {
    await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: clock.now() } });
  }

  async function logoutAll(userId: string) {
    await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: clock.now() } });
  }

  return { requestCode, verifyCode, logout, logoutAll };
}

export type AuthService = ReturnType<typeof createAuthService>;
