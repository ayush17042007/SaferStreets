import request from "supertest";
import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../../src/config/rateLimits.js";
import { buildTestApp, createUserWithSession, pool } from "../helpers.js";

describe("rate limiting (rate-limiter-flexible, Postgres store)", () => {
  it("returns 429 with Retry-After once the budget is spent", async () => {
    const { app } = buildTestApp({ limits: { general: { points: 2, durationSeconds: 60, key: "user" } } });
    expect((await request(app).get("/api/v1/nope")).status).toBe(404);
    expect((await request(app).get("/api/v1/nope")).status).toBe(404);
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(res.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("stores counters in the shared Postgres table", async () => {
    const { app } = buildTestApp({ limits: { general: { points: 5, durationSeconds: 60, key: "user" } } });
    await request(app).get("/api/v1/nope");
    const { rows } = await pool.query("SELECT key, points FROM rate_limits WHERE key LIKE 'general:%'");
    expect(rows.length).toBe(1);
    expect(rows[0].points).toBe(1);
  });

  it("keys by user id when signed in, so users do not share an IP budget", async () => {
    const { app } = buildTestApp({ limits: { general: { points: 1, durationSeconds: 60, key: "user" } } });
    const a = await createUserWithSession();
    const b = await createUserWithSession();
    expect((await request(app).get("/api/v1/nope").set("Cookie", a.cookie)).status).toBe(404);
    expect((await request(app).get("/api/v1/nope").set("Cookie", b.cookie)).status).toBe(404);
    expect((await request(app).get("/api/v1/nope").set("Cookie", a.cookie)).status).toBe(429);
  });

  it("never rate-limits health probes", async () => {
    const { app } = buildTestApp({ limits: { general: { points: 1, durationSeconds: 60, key: "user" } } });
    for (let i = 0; i < 3; i++) expect((await request(app).get("/health/live")).status).toBe(200);
  });

  it("encodes the appendix-09 defaults", () => {
    expect(RATE_LIMITS.general).toMatchObject({ points: 120, durationSeconds: 60 });
    expect(RATE_LIMITS.otpRequestPerEmail).toMatchObject({ points: 5, durationSeconds: 3600, key: "email" });
    expect(RATE_LIMITS.otpRequestPerIp).toMatchObject({ points: 20, durationSeconds: 3600, key: "ip" });
    expect(RATE_LIMITS.reportCreate).toMatchObject({ points: 5, durationSeconds: 86_400 });
    expect(RATE_LIMITS.rideRequestCreate).toMatchObject({ points: 10, durationSeconds: 86_400 });
    expect(RATE_LIMITS.journeyStart).toMatchObject({ points: 3, durationSeconds: 3600 });
    expect(RATE_LIMITS.alertCreateHourly).toMatchObject({ points: 3, durationSeconds: 3600 });
    expect(RATE_LIMITS.alertCreateDaily).toMatchObject({ points: 10, durationSeconds: 86_400 });
    expect(RATE_LIMITS.flagCreate).toMatchObject({ points: 20, durationSeconds: 86_400 });
  });
});
