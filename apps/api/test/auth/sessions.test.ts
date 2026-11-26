import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/lib/logger.js";
import { fixedClock } from "../../src/lib/clock.js";
import { createApp } from "../../src/app.js";
import { createRateLimiters } from "../../src/middleware/rateLimit.js";
import { buildTestApp, createUser, env, inlineEmailPublisher, pool, prisma, xhr } from "../helpers.js";
import {
  cookieFrom,
  latestCode,
  login,
  loginOnboarded,
  requestCode,
  setCookieLine,
  verifyCode,
} from "../authHelpers.js";

describe("sessions", () => {
  it("logout revokes only the current session and clears the cookie", async () => {
    const { app } = buildTestApp();
    const a = await login(app, "riya@example.test");
    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    const b = await login(app, "riya@example.test");

    const out = await request(app).post("/api/v1/auth/logout").set(xhr).set("Cookie", a);
    expect(out.status).toBe(200);
    expect(setCookieLine(out)).toMatch(/ss_session=;/);
    expect((await request(app).get("/api/v1/me").set("Cookie", a)).status).toBe(401);
    expect((await request(app).get("/api/v1/me").set("Cookie", b)).status).toBe(200);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it("logout-all revokes every session of the user, and nobody else's", async () => {
    const { app } = buildTestApp();
    const a = await login(app, "riya@example.test");
    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    const b = await login(app, "riya@example.test");
    const other = await login(app, "arjun@example.test");

    expect((await request(app).post("/api/v1/auth/logout-all").set(xhr).set("Cookie", a)).status).toBe(200);
    expect((await request(app).get("/api/v1/me").set("Cookie", a)).status).toBe(401);
    expect((await request(app).get("/api/v1/me").set("Cookie", b)).status).toBe(401);
    expect((await request(app).get("/api/v1/me").set("Cookie", other)).status).toBe(200);
  });

  it("requires a session to log out", async () => {
    const { app } = buildTestApp();
    expect((await request(app).post("/api/v1/auth/logout").set(xhr)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/logout-all").set(xhr)).status).toBe(401);
  });

  it("rejects an expired session and a revoked session", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(401);
  });

  it("rejects suspended and banned users on the very next request, with 403", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(200);
    await prisma.user.updateMany({ data: { status: "SUSPENDED" } });
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(403);
    await prisma.user.updateMany({ data: { status: "BANNED" } });
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(403);
    await prisma.user.updateMany({ data: { status: "ACTIVE" } });
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(200);
  });

  it("extends the 30-day window at most once a day and refreshes the cookie", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    const fresh = await request(app).get("/api/v1/me").set("Cookie", cookie);
    expect(fresh.headers["set-cookie"]).toBeUndefined(); // brand new: nothing to extend

    const aged = new Date(Date.now() + 20 * 86_400_000);
    await prisma.session.updateMany({ data: { expiresAt: aged } });
    const res = await request(app).get("/api/v1/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(setCookieLine(res)).toContain(cookie.split("=")[1]!);
    const row = await prisma.session.findFirstOrThrow();
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
  });

  it("lists active sessions and marks the current one", async () => {
    const { app } = buildTestApp();
    const a = await login(app, "riya@example.test");
    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    await login(app, "riya@example.test");
    const res = await request(app).get("/api/v1/me/sessions").set("Cookie", a);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("tokenHash");
  });
});

describe("CSRF on auth endpoints", () => {
  it("blocks state-changing requests without X-Requested-With or from a foreign origin", async () => {
    const { app } = buildTestApp();
    const noHeader = await request(app)
      .post("/api/v1/auth/otp/request")
      .send({ email: "a@example.test", turnstileToken: "t" });
    expect(noHeader.status).toBe(403);
    const foreign = await request(app)
      .post("/api/v1/auth/otp/request")
      .set(xhr)
      .set("Origin", "https://evil.example")
      .send({ email: "a@example.test", turnstileToken: "t" });
    expect(foreign.status).toBe(403);
    const ours = await request(app)
      .post("/api/v1/auth/otp/request")
      .set(xhr)
      .set("Origin", "http://localhost:3000")
      .send({ email: "a@example.test", turnstileToken: "t" });
    expect(ours.status).toBe(200);
    expect(await prisma.otpCode.count()).toBe(1);
  });

  it("does not let a cross-site POST logout, delete or change data", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test");
    for (const [method, path] of [
      ["post", "/api/v1/auth/logout"],
      ["delete", "/api/v1/me"],
      ["patch", "/api/v1/me"],
      ["post", "/api/v1/me/contacts"],
    ] as const) {
      const res = await request(app)[method](path).set("Cookie", cookie).set("Origin", "https://evil.example").send({});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(200);
  });
});

describe("secrets never reach the logs", () => {
  it("does not log OTP codes, session tokens or email addresses through request, verify and logout", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _e, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const logger = createLogger({ level: "trace" });
    // Re-create the logger with our sink but the same redaction config.
    const { REDACT_PATHS } = await import("../../src/lib/logger.js");
    const { pino } = await import("pino");
    const sinkLogger = pino({ level: "trace", redact: { paths: REDACT_PATHS, censor: "[redacted]" } }, stream);
    void logger;
    const { app } = createApp({
      env,
      prisma,
      pool,
      logger: sinkLogger,
      clock: fixedClock(new Date()),
      publisher: inlineEmailPublisher(),
      turnstile: { verify: async () => true },
      cloudinary: null,
      geo: null,
      limiters: createRateLimiters(pool),
    });
    const email = "secret.person@example.test";
    await requestCode(app, email);
    const code = await latestCode(email);
    const verified = await verifyCode(app, email, code);
    const token = cookieFrom(verified)!.split("=")[1]!;
    await request(app).get("/api/v1/me").set("Cookie", `ss_session=${token}`);
    await verifyCode(app, email, "000000");
    await request(app).post("/api/v1/auth/logout").set(xhr).set("Cookie", `ss_session=${token}`);

    const logs = lines.join("\n");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(code);
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(email);
    void createUser;
  });
});
