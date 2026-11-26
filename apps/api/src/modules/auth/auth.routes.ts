import {
  otpRequestResponseSchema,
  otpRequestSchema,
  otpVerifyResponseSchema,
  otpVerifySchema,
  type OtpRequest,
  type OtpVerify,
} from "@saferstreets/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { RouteDef } from "../../http/routes.js";
import { rateLimit, type RateLimiters } from "../../middleware/rateLimit.js";
import type { AuthService } from "./auth.service.js";
import { clearSessionCookie, setSessionCookie } from "./session.js";

const okSchema = z.object({ data: z.object({ ok: z.literal(true) }) });

export function authRoutes(deps: { service: AuthService; env: Env; limiters: RateLimiters }): RouteDef[] {
  const { service, env, limiters } = deps;

  const request: RequestHandler = async (req, res, next) => {
    try {
      const body = req.body as OtpRequest;
      const data = await service.requestCode({ email: body.email, turnstileToken: body.turnstileToken, ip: req.ip });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  const verify: RequestHandler = async (req, res, next) => {
    try {
      const body = req.body as OtpVerify;
      const out = await service.verifyCode({
        email: body.email,
        code: body.code,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      setSessionCookie(res, env, out.session.token, out.session.expiresAt);
      res.json({ data: { needsOnboarding: out.needsOnboarding } });
    } catch (err) {
      next(err);
    }
  };

  const logout: RequestHandler = async (req, res, next) => {
    try {
      if (req.auth) await service.logout(req.auth.sessionId);
      clearSessionCookie(res, env);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  };

  const logoutAll: RequestHandler = async (req, res, next) => {
    try {
      if (req.auth) await service.logoutAll(req.auth.userId);
      clearSessionCookie(res, env);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  };

  return [
    {
      method: "post",
      path: "/auth/otp/request",
      summary: "Send a log in code. The answer is identical for known and unknown emails.",
      tags: ["auth"],
      auth: "public",
      request: { body: otpRequestSchema },
      responses: {
        200: { description: "Neutral confirmation", schema: otpRequestResponseSchema },
        429: { description: "Too many requests (Retry-After header)" },
      },
      handlers: [rateLimit(limiters.otpRequestPerIp, "ip"), rateLimit(limiters.otpRequestPerEmail, "email"), request],
    },
    {
      method: "post",
      path: "/auth/otp/verify",
      summary: "Verify a code and start a session (sets the session cookie).",
      tags: ["auth"],
      auth: "public",
      request: { body: otpVerifySchema },
      responses: {
        200: { description: "Logged in", schema: otpVerifyResponseSchema },
        400: { description: "OTP_INVALID (meta.attemptsLeft) or OTP_EXPIRED" },
        429: { description: "OTP_LOCKED" },
      },
      handlers: [verify],
    },
    {
      method: "post",
      path: "/auth/logout",
      summary: "Revoke the current session.",
      tags: ["auth"],
      auth: "user",
      responses: { 200: { description: "Logged out", schema: okSchema } },
      handlers: [logout],
    },
    {
      method: "post",
      path: "/auth/logout-all",
      summary: "Revoke every session of the current user.",
      tags: ["auth"],
      auth: "user",
      responses: { 200: { description: "Logged out everywhere", schema: okSchema } },
      handlers: [logoutAll],
    },
  ];
}
