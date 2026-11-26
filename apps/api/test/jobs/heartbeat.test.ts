import { PgBoss } from "pg-boss";
import { afterAll, describe, expect, it } from "vitest";
import { heartbeatJob, writeHeartbeat } from "../../src/jobs/handlers/heartbeat.js";
import { JOB_NAMES, deadLetterName, registerJobs, withJobLogging } from "../../src/jobs/registry.js";
import { fixedClock, systemClock } from "../../src/lib/clock.js";
import { HEARTBEAT_NAME } from "../../src/modules/health/health.service.js";
import { env, pool, prisma, silentLogger } from "../helpers.js";

const TEST_SCHEMA = "pgboss_test";

afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
});

describe("scheduler.heartbeat", () => {
  it("upserts heartbeats(name='scheduler') with the injected clock, idempotently", async () => {
    const clock = fixedClock("2026-11-25T10:00:00Z");
    await writeHeartbeat({ prisma, clock });
    await writeHeartbeat({ prisma, clock });
    clock.advance(60_000);
    await heartbeatJob.handler(
      {},
      { prisma, clock, log: silentLogger, jobId: "j1", retryCount: 0, retryLimit: 2, isLastAttempt: false },
    );
    const rows = await prisma.heartbeat.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: HEARTBEAT_NAME, lastSeenAt: new Date("2026-11-25T10:01:00Z") });
  });

  it("is scheduled every minute with retries and backoff", () => {
    expect(heartbeatJob).toMatchObject({ name: "scheduler.heartbeat", schedule: { cron: "* * * * *" } });
    expect(heartbeatJob.retryLimit).toBeGreaterThan(0);
  });

  it("logging wrapper re-throws so pg-boss retries", async () => {
    const failing = { ...heartbeatJob, handler: async () => Promise.reject(new Error("db down")) };
    const run = withJobLogging(failing, { prisma, clock: systemClock, log: silentLogger });
    await expect(run({ id: "j2", data: {} })).rejects.toThrow("db down");
  });

  it("runs end to end through pg-boss with a dead-letter queue", async () => {
    const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: TEST_SCHEMA });
    boss.on("error", () => {});
    await boss.start();
    try {
      await registerJobs(boss, [{ ...heartbeatJob, schedule: undefined } as never], {
        prisma,
        clock: systemClock,
        log: silentLogger,
      });
      const queue = await boss.getQueue(JOB_NAMES.schedulerHeartbeat);
      expect(queue?.deadLetter).toBe(deadLetterName(JOB_NAMES.schedulerHeartbeat));
      expect(queue?.retryBackoff).toBe(true);

      await boss.send(JOB_NAMES.schedulerHeartbeat, {});
      const deadline = Date.now() + 20_000;
      let row = null;
      while (!row && Date.now() < deadline) {
        row = await prisma.heartbeat.findUnique({ where: { name: HEARTBEAT_NAME } });
        if (!row) await new Promise((r) => setTimeout(r, 250));
      }
      expect(row).not.toBeNull();
      expect(Date.now() - row!.lastSeenAt.getTime()).toBeLessThan(30_000);
    } finally {
      await boss.stop({ graceful: false, close: true });
    }
  });
});
