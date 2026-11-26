// How the HTTP process hands work to the worker. Request paths only enqueue (Part B3).
import { PgBoss } from "pg-boss";
import type { Logger } from "../lib/logger.js";
import { JOB_NAMES, deadLetterName, type JobName } from "./registry.js";

export interface JobPublisher {
  enqueue(name: JobName, data: object): Promise<void>;
  close(): Promise<void>;
}

export const PGBOSS_SCHEMA = "pgboss";

/** Publish-only pg-boss client: no maintenance, no scheduling, no workers (those live in worker.ts). */
export async function createPgBossPublisher(opts: {
  connectionString: string;
  log: Logger;
  /** Override only in tests. */
  schema?: string;
}): Promise<JobPublisher> {
  const boss = new PgBoss({
    connectionString: opts.connectionString,
    schema: opts.schema ?? PGBOSS_SCHEMA,
    application_name: "saferstreets-api",
    supervise: false,
    schedule: false,
  });
  boss.on("error", (err) => opts.log.error({ err }, "pg-boss publisher error"));
  await boss.start();
  // Queues are created by the worker too; creating them here as well is idempotent and means an
  // email enqueued before the worker's first start is not lost.
  for (const name of [JOB_NAMES.emailSend, JOB_NAMES.alertFanout]) {
    await boss.createQueue(deadLetterName(name), {});
    await boss.createQueue(name, { deadLetter: deadLetterName(name) });
  }
  return {
    async enqueue(name, data) {
      await boss.send(name, data);
    },
    close: () => boss.stop({ graceful: true, close: true, timeout: 5000 }),
  };
}

/** Test publisher: records jobs and optionally runs them straight away. */
export function createInlinePublisher(run?: (name: JobName, data: object) => Promise<void>): JobPublisher & {
  jobs: Array<{ name: JobName; data: object }>;
} {
  const jobs: Array<{ name: JobName; data: object }> = [];
  return {
    jobs,
    async enqueue(name, data) {
      jobs.push({ name, data });
      await run?.(name, data);
    },
    async close() {},
  };
}
