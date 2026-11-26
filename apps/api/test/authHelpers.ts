// Helpers for auth tests: request a code, read it from the capture mailer, log in.
import request from "supertest";
import type { Express } from "express";
import { prisma, xhr } from "./helpers.js";

export function cookieFrom(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers["set-cookie"] as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const line = list.find((c) => c.startsWith("ss_session="));
  return line?.split(";")[0];
}

export function setCookieLine(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"] as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((c) => c.startsWith("ss_session=")) ?? "";
}

export async function requestCode(app: Express, email: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/auth/otp/request")
    .set(xhr)
    .send({ email, turnstileToken: "test-token", ...extra });
}

/** The newest code that was "sent" to this address, read from the capture mailer. */
export async function latestCode(email: string): Promise<string> {
  const mail = await prisma.capturedEmail.findFirst({ where: { toEmail: email }, orderBy: { createdAt: "desc" } });
  const m = mail?.textBody.match(/log in code: (\d{6})/);
  if (!m) throw new Error(`no code captured for ${email}`);
  return m[1]!;
}

export async function verifyCode(app: Express, email: string, code: string) {
  return request(app).post("/api/v1/auth/otp/verify").set(xhr).send({ email, code });
}

/** Full login: request + read code + verify. Returns the Cookie header value. */
export async function login(app: Express, email: string): Promise<string> {
  const r = await requestCode(app, email);
  if (r.status !== 200) throw new Error(`request failed: ${r.status} ${JSON.stringify(r.body)}`);
  const code = await latestCode(email);
  const v = await verifyCode(app, email, code);
  const cookie = cookieFrom(v);
  if (v.status !== 200 || !cookie) throw new Error(`verify failed: ${v.status} ${JSON.stringify(v.body)}`);
  return cookie;
}

/** Login then finish onboarding, so the user is a normal member. */
export async function loginOnboarded(app: Express, email: string, name = "Riya Sharma"): Promise<string> {
  const cookie = await login(app, email);
  const res = await request(app)
    .patch("/api/v1/me")
    .set(xhr)
    .set("Cookie", cookie)
    .send({ fullName: name, acceptTerms: true });
  if (res.status !== 200) throw new Error(`onboarding failed: ${res.status} ${JSON.stringify(res.body)}`);
  return cookie;
}
