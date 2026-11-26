import { readyResponseSchema } from "@saferstreets/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { writeHeartbeat } from "../../src/jobs/handlers/heartbeat.js";
import { fixedClock } from "../../src/lib/clock.js";
import { createHealthRepository } from "../../src/modules/health/health.repository.js";
import { createHealthService, migrationsOnDisk } from "../../src/modules/health/health.service.js";
import { buildTestApp, prisma, silentLogger } from "../helpers.js";

describe("GET /health/live", () => {
  it("is mounted at the API root and under /api", async () => {
    const { app } = buildTestApp();
    for (const path of ["/health/live", "/api/health/live"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    }
  });
});

describe("GET /health/ready", () => {
  it("is 503 when the worker heartbeat is missing", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(readyResponseSchema.parse(res.body)).toEqual({
      status: "unavailable",
      checks: { database: "ok", migrations: "ok", worker: "fail" },
    });
  });

  it("is 200 with a fresh heartbeat, at both mounts", async () => {
    const clock = fixedClock("2026-11-25T10:00:00Z");
    await writeHeartbeat({ prisma, clock });
    const { app } = buildTestApp({ clock });
    for (const path of ["/health/ready", "/api/health/ready"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok", checks: { database: "ok", migrations: "ok", worker: "ok" } });
    }
  });

  it("turns 503 once the heartbeat is 3 minutes old", async () => {
    const clock = fixedClock("2026-11-25T10:00:00Z");
    await writeHeartbeat({ prisma, clock });
    const { app } = buildTestApp({ clock });
    clock.advance(2 * 60_000 + 59_000);
    expect((await request(app).get("/health/ready")).status).toBe(200);
    clock.advance(1_000);
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.checks.worker).toBe("fail");
  });

  it("exposes no versions, secrets or error text", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/health/ready");
    expect(Object.keys(res.body).sort()).toEqual(["checks", "status"]);
    expect(JSON.stringify(res.body)).not.toMatch(/version|postgres|secret|prisma/i);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("fails the migrations check when a migration on disk is not applied", async () => {
    const svc = createHealthService({
      repo: createHealthRepository(prisma),
      clock: fixedClock(new Date()),
      log: silentLogger,
      migrations: [...migrationsOnDisk(), "29991231000000_future"],
    });
    expect((await svc.ready()).checks.migrations).toBe("fail");
  });

  it("fails the database check (and everything after it) when the DB is unreachable", async () => {
    const svc = createHealthService({
      repo: {
        ping: () => Promise.reject(new Error("connection refused")),
        appliedMigrations: () => Promise.resolve([]),
        heartbeat: () => Promise.resolve(null),
      },
      clock: fixedClock(new Date()),
      log: silentLogger,
      migrations: ["x"],
    });
    expect(await svc.ready()).toEqual({
      status: "unavailable",
      checks: { database: "fail", migrations: "fail", worker: "fail" },
    });
  });
});
