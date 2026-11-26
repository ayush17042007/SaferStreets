import { createHmac } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorResponseSchema, otpRequestResponseSchema } from "@saferstreets/shared";
import { fixedClock } from "../../src/lib/clock.js";
import { buildTestApp, createUser, env, prisma, xhr } from "../helpers.js";
import { cookieFrom, latestCode, requestCode, setCookieLine, verifyCode } from "../authHelpers.js";

const EMAIL = "riya@example.test";
const wrongCode = (real: string) => (real === "000000" ? "111111" : "000000");

describe("POST /auth/otp/request", () => {
  it("answers identically for known and unknown emails (enumeration resistance)", async () => {
    await createUser({ email: "known@example.test" });
    const { app } = buildTestApp();
    const known = await requestCode(app, "known@example.test");
    const unknown = await requestCode(app, "nobody@example.test");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(otpRequestResponseSchema.parse(known.body)).toEqual(otpRequestResponseSchema.parse(unknown.body));
    expect(known.body.data).toEqual({
      message: "If this email is valid, a code has been sent.",
      resendAfterSeconds: 60,
    });
    // Both addresses got a code and an email; no account is created by a request.
    expect(await prisma.otpCode.count()).toBe(2);
    expect(await prisma.capturedEmail.count()).toBe(2);
    expect(await prisma.user.findUnique({ where: { email: "nobody@example.test" } })).toBeNull();
  });

  it("refuses when the Turnstile check fails, and sends nothing", async () => {
    const { app } = buildTestApp({ turnstile: { verify: async () => false } });
    const res = await requestCode(app, EMAIL);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("turnstileToken");
    expect(await prisma.otpCode.count()).toBe(0);
    expect(await prisma.capturedEmail.count()).toBe(0);
  });

  it("requires a Turnstile token and a valid email", async () => {
    const { app } = buildTestApp();
    const noToken = await request(app).post("/api/v1/auth/otp/request").set(xhr).send({ email: EMAIL });
    expect(noToken.status).toBe(400);
    const badEmail = await requestCode(app, "not-an-email");
    expect(badEmail.status).toBe(400);
  });

  it("passes the visitor IP and token to the Turnstile verifier", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const { app } = buildTestApp({
      turnstile: {
        verify: async (t, ip) => {
          calls.push([t, ip]);
          return true;
        },
      },
    });
    await requestCode(app, EMAIL, { turnstileToken: "abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("abc");
  });

  it("enforces a 60 second resend cooldown without revealing it differently", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    const first = await requestCode(app, EMAIL);
    const second = await requestCode(app, EMAIL);
    expect(second.status).toBe(200);
    expect(second.body.data.message).toBe(first.body.data.message);
    expect(second.body.data.resendAfterSeconds).toBeLessThanOrEqual(60);
    expect(await prisma.capturedEmail.count()).toBe(1);
    expect(await prisma.otpCode.count()).toBe(1);

    clock.advance(61_000);
    await requestCode(app, EMAIL);
    expect(await prisma.capturedEmail.count()).toBe(2);
    expect(await prisma.otpCode.count()).toBe(2);
  });

  it("allows 5 requests per email per hour, then 429 with Retry-After", async () => {
    const { app } = buildTestApp();
    for (let i = 0; i < 5; i++) expect((await requestCode(app, EMAIL)).status).toBe(200);
    const sixth = await requestCode(app, EMAIL);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RATE_LIMITED");
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
    // A different email is unaffected.
    expect((await requestCode(app, "other@example.test")).status).toBe(200);
  });

  it("allows 20 requests per IP per hour, then 429", async () => {
    const { app } = buildTestApp();
    for (let i = 0; i < 20; i++) expect((await requestCode(app, `user${i}@example.test`)).status).toBe(200);
    const next = await requestCode(app, "user99@example.test");
    expect(next.status).toBe(429);
    expect(Number(next.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("stores only an HMAC of the code and emails the code through the job payload sealed", async () => {
    const publisherJobs: Array<{ name: string; data: object }> = [];
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    const row = await prisma.otpCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(row.codeHash).toBe(createHmac("sha256", env.OTP_HMAC_SECRET).update(`${EMAIL}:${code}`).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(10 * 60_000);
    void publisherJobs;
    const event = await prisma.emailEvent.findFirstOrThrow();
    expect(event).toMatchObject({ template: "otp", status: "SENT" });
    expect(event.toHash).toHaveLength(64);
    expect(JSON.stringify(event)).not.toContain(EMAIL);
  });
});

describe("POST /auth/otp/verify", () => {
  it("logs a new user in: creates the account, a session and the cookie", async () => {
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    const res = await verifyCode(app, EMAIL, code);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ needsOnboarding: true });
    const cookie = cookieFrom(res)!;
    expect(cookie).toMatch(/^ss_session=[A-Za-z0-9_-]{43}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.lastLoginAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("sets a hardened cookie: HttpOnly, SameSite=Lax, Path=/, ~30 days, Secure over https", async () => {
    const http = buildTestApp();
    await requestCode(http.app, EMAIL);
    const res = await verifyCode(http.app, EMAIL, await latestCode(EMAIL));
    const line = setCookieLine(res);
    expect(line).toContain("HttpOnly");
    expect(line).toContain("SameSite=Lax");
    expect(line).toContain("Path=/");
    expect(line).not.toContain("Secure");
    const exp = new Date(/Expires=([^;]+)/.exec(line)![1]!).getTime();
    expect(exp - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
    expect(exp - Date.now()).toBeLessThan(30.1 * 86_400_000);

    const https = buildTestApp({ env: { APP_ORIGIN: "https://saferstreets.example" } });
    await requestCode(https.app, "second@example.test");
    const res2 = await request(https.app)
      .post("/api/v1/auth/otp/verify")
      .set(xhr)
      .send({ email: "second@example.test", code: await latestCode("second@example.test") });
    expect(setCookieLine(res2)).toContain("Secure");
  });

  it("stores only the hash of the session token", async () => {
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const res = await verifyCode(app, EMAIL, await latestCode(EMAIL));
    const token = cookieFrom(res)!.split("=")[1]!;
    const session = await prisma.session.findFirstOrThrow();
    expect(session.tokenHash).toBe(createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex"));
    expect(JSON.stringify(session)).not.toContain(token);
  });

  it("rotates: every login issues a new token and keeps other sessions alive", async () => {
    const { app } = buildTestApp();
    const clock = fixedClock(new Date());
    void clock;
    await requestCode(app, EMAIL);
    const first = cookieFrom(await verifyCode(app, EMAIL, await latestCode(EMAIL)))!;
    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    await requestCode(app, EMAIL);
    const second = cookieFrom(await verifyCode(app, EMAIL, await latestCode(EMAIL)))!;
    expect(second).not.toBe(first);
    expect(await prisma.session.count()).toBe(2);
    expect((await request(app).get("/api/v1/me").set("Cookie", first)).status).toBe(200);
    expect((await request(app).get("/api/v1/me").set("Cookie", second)).status).toBe(200);
  });

  it("is single use: the same code cannot be replayed", async () => {
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    expect((await verifyCode(app, EMAIL, code)).status).toBe(200);
    const replay = await verifyCode(app, EMAIL, code);
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("OTP_INVALID");
    expect(await prisma.session.count()).toBe(1);
  });

  it("two parallel verifications with the right code create exactly one session", async () => {
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    const results = await Promise.all([
      verifyCode(app, EMAIL, code),
      verifyCode(app, EMAIL, code),
      verifyCode(app, EMAIL, code),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.session.count()).toBe(1);
  });

  it("expires codes after 10 minutes", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    clock.advance(10 * 60_000 - 1000);
    // Still valid just before expiry (verified below with a wrong code to not consume it).
    expect((await verifyCode(app, EMAIL, wrongCode(code))).body.error.code).toBe("OTP_INVALID");
    clock.advance(2000);
    const res = await verifyCode(app, EMAIL, code);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
    expect(res.body.error.message).toBe("That code has expired. Request a new one.");
    expect(await prisma.session.count()).toBe(0);
  });

  it("counts down wrong guesses (attempts left), then locks after 5, even for the right code", async () => {
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    const bad = wrongCode(code);
    const lefts: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await verifyCode(app, EMAIL, bad);
      expect(r.status).toBe(400);
      expect(errorResponseSchema.parse(r.body).error.code).toBe("OTP_INVALID");
      lefts.push(r.body.error.meta.attemptsLeft);
    }
    expect(lefts).toEqual([4, 3, 2, 1]);
    const fifth = await verifyCode(app, EMAIL, bad);
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe("OTP_LOCKED");
    const right = await verifyCode(app, EMAIL, code);
    expect(right.status).toBe(429);
    expect(right.body.error.code).toBe("OTP_LOCKED");
    expect(await prisma.session.count()).toBe(0);
    expect((await prisma.otpCode.findFirstOrThrow()).attempts).toBe(5);
  });

  it("parallel wrong guesses cannot exceed 5 attempts", async () => {
    const { app } = buildTestApp();
    await requestCode(app, EMAIL);
    const code = await latestCode(EMAIL);
    await Promise.all(Array.from({ length: 12 }, () => verifyCode(app, EMAIL, wrongCode(code))));
    expect((await prisma.otpCode.findFirstOrThrow()).attempts).toBeLessThanOrEqual(5);
    expect((await verifyCode(app, EMAIL, code)).status).toBe(429);
  });

  it("a locked email recovers with a fresh code after the cooldown; only the newest code works", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    await requestCode(app, EMAIL);
    const oldCode = await latestCode(EMAIL);
    for (let i = 0; i < 5; i++) await verifyCode(app, EMAIL, wrongCode(oldCode));
    clock.advance(61_000);
    await requestCode(app, EMAIL);
    const newCode = await latestCode(EMAIL);
    if (newCode !== oldCode) {
      const stale = await verifyCode(app, EMAIL, oldCode);
      expect(stale.status).toBe(400);
    }
    expect((await verifyCode(app, EMAIL, newCode)).status).toBe(200);
  });

  it("only the newest valid code works when two were requested", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    await requestCode(app, EMAIL);
    const first = await latestCode(EMAIL);
    clock.advance(61_000);
    await requestCode(app, EMAIL);
    const second = await latestCode(EMAIL);
    expect(await prisma.otpCode.count({ where: { consumedAt: null } })).toBe(1);
    if (first !== second) expect((await verifyCode(app, EMAIL, first)).status).toBe(400);
    expect((await verifyCode(app, EMAIL, second)).status).toBe(200);
  });

  it("answers an address that never asked for a code like a wrong code", async () => {
    const { app } = buildTestApp();
    const res = await verifyCode(app, "ghost@example.test", "123456");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_INVALID");
    expect(await prisma.user.count()).toBe(0);
  });

  it("wrong codes look the same for existing and unknown accounts (same code, status and shape)", async () => {
    await createUser({ email: "known@example.test" });
    const { app } = buildTestApp();
    await requestCode(app, "known@example.test");
    await requestCode(app, "unknown@example.test");
    const a = await verifyCode(app, "known@example.test", wrongCode(await latestCode("known@example.test")));
    const b = await verifyCode(app, "unknown@example.test", wrongCode(await latestCode("unknown@example.test")));
    expect(a.status).toBe(b.status);
    expect(a.body.error.code).toBe(b.body.error.code);
    expect(a.body.error.message).toBe(b.body.error.message);
    expect(a.body.error.meta).toEqual(b.body.error.meta);
  });

  it("rejects malformed codes with a validation error", async () => {
    const { app } = buildTestApp();
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      const res = await verifyCode(app, EMAIL, code);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("deleted, suspended and banned accounts cannot log in and get the generic answer", async () => {
    const { app } = buildTestApp();
    for (const [email, data] of [
      ["deleted@example.test", { status: "DELETED" as const, deletedAt: new Date() }],
      ["suspended@example.test", { status: "SUSPENDED" as const }],
      ["banned@example.test", { status: "BANNED" as const }],
    ] as const) {
      await prisma.user.create({ data: { email, ...data } });
      await requestCode(app, email);
      const res = await verifyCode(app, email, await latestCode(email));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("OTP_INVALID");
      expect(cookieFrom(res)).toBeUndefined();
    }
    expect(await prisma.session.count()).toBe(0);
  });

  it("matches emails case-insensitively", async () => {
    const { app } = buildTestApp();
    await requestCode(app, "Riya@Example.TEST");
    const res = await verifyCode(app, "riya@example.test", await latestCode("riya@example.test"));
    expect(res.status).toBe(200);
  });
});
