// Job worker entrypoint (Part B1, B3). `ROLE=worker node dist/index.js` or `tsx src/worker.ts`.
// pg-boss runs only here, never in the HTTP process.
import { PgBoss } from "pg-boss";
import { loadEnv, type Env } from "./config/env.js";
import { writeHeartbeat } from "./jobs/handlers/heartbeat.js";
import { buildJobs } from "./jobs/index.js";
import { registerJobs, type JobContext } from "./jobs/registry.js";
import { systemClock } from "./lib/clock.js";
import { createRuntime, isEntry, onShutdown } from "./runtime.js";

export const PGBOSS_SCHEMA = "pgboss";

export async function startWorker(env: Env): Promise<{ boss: PgBoss; stop: () => Promise<void> }> {
  const rt = createRuntime(env);
  const log = rt.logger.child({ role: "worker" });
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: PGBOSS_SCHEMA,
    application_name: "saferstreets-worker",
  });
  boss.on("error", (err) => log.error({ err }, "pg-boss error"));

  await boss.start();
  const ctx: JobContext = { prisma: rt.prisma, log, clock: systemClock };
  const publisher = {
    enqueue: async (name: string, data: object) => {
      await boss.send(name, data);
    },
    close: async () => {},
  };
  await registerJobs(boss, buildJobs(env, rt.prisma, publisher), ctx);
  // Beat once at boot so readiness turns green without waiting for the first cron tick.
  await writeHeartbeat(ctx);
  log.info("worker started");

  const stop = async () => {
    await boss.stop({ graceful: true, timeout: 10_000 });
    await rt.prisma.$disconnect();
    await rt.pool.end();
  };
  onShutdown(log, stop);
  return { boss, stop };
}

if (isEntry(import.meta.url)) {
  void startWorker(loadEnv());
}
