// Job registry on pg-boss (Part B3). Each job has a typed name, retry with exponential backoff,
// a dead-letter queue (<name>.dlq), and a logging wrapper. Handlers must be idempotent.
import type { PgBoss } from "pg-boss";
import type { Clock } from "../lib/clock.js";
import type { Logger } from "../lib/logger.js";
import type { PrismaClient } from "../lib/prisma.js";

/** Every job name in the system. Later prompts add journey.scan, email.send, ride.lifecycle, ... */
export const JOB_NAMES = {
  schedulerHeartbeat: "scheduler.heartbeat",
  emailSend: "email.send",
  rideLifecycle: "ride.lifecycle",
  journeyScan: "journey.scan",
  alertFanout: "alert.fanout",
  alertExpire: "alert.expire",
  cleanupNightly: "cleanup.nightly",
} as const;
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface JobContext {
  prisma: PrismaClient;
  log: Logger;
  clock: Clock;
}

export interface JobDefinition<Data extends object = Record<string, never>> {
  name: JobName;
  /** Seconds finished jobs stay in the queue tables (default 7 days). Use a short time for jobs with sensitive payloads. */
  deleteAfterSeconds?: number;
  /** Cron (pg-boss 5-field) plus optional IANA timezone, e.g. "0 2 * * *" + "Asia/Kolkata". */
  schedule?: { cron: string; tz?: string };
  retryLimit: number;
  /** Initial retry delay in seconds; doubled per attempt with jitter (retryBackoff). */
  retryDelaySeconds: number;
  retryDelayMaxSeconds?: number;
  expireInSeconds?: number;
  handler: (
    data: Data,
    ctx: JobContext & { jobId: string; retryCount: number; retryLimit: number; isLastAttempt: boolean },
  ) => Promise<void>;
}

export function defineJob<Data extends object = Record<string, never>>(def: JobDefinition<Data>): JobDefinition<Data> {
  return def;
}

export const deadLetterName = (name: JobName) => `${name}.dlq`;

/** Wraps a handler with structured start/ok/fail logging. Failures re-throw so pg-boss retries. */
export function withJobLogging<Data extends object>(def: JobDefinition<Data>, ctx: JobContext) {
  return async (job: { id: string; data: Data; retryCount?: number; retryLimit?: number }) => {
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 0;
    const log = ctx.log.child({ job: def.name, jobId: job.id });
    const started = Date.now();
    log.debug("job started");
    try {
      await def.handler(job.data, {
        ...ctx,
        log,
        jobId: job.id,
        retryCount,
        retryLimit,
        isLastAttempt: retryCount >= retryLimit,
      });
      log.debug({ ms: Date.now() - started }, "job ok");
    } catch (err) {
      log.error({ err, ms: Date.now() - started }, "job failed");
      throw err;
    }
  };
}

export async function registerJobs(boss: PgBoss, defs: JobDefinition<object>[], ctx: JobContext): Promise<void> {
  for (const def of defs) {
    const dlq = deadLetterName(def.name);
    await boss.createQueue(dlq, { retentionSeconds: 14 * 24 * 3600 });
    // The API publisher may have created the queue first, so always apply the full options.
    const queueOptions = {
      retryLimit: def.retryLimit,
      retryDelay: def.retryDelaySeconds,
      retryBackoff: true,
      ...(def.retryDelayMaxSeconds ? { retryDelayMax: def.retryDelayMaxSeconds } : {}),
      ...(def.expireInSeconds ? { expireInSeconds: def.expireInSeconds } : {}),
      ...(def.deleteAfterSeconds !== undefined ? { deleteAfterSeconds: def.deleteAfterSeconds } : {}),
      deadLetter: dlq,
    };
    await boss.createQueue(def.name, queueOptions);
    await boss.updateQueue(def.name, queueOptions);
    const run = withJobLogging(def, ctx);
    await boss.work<object>(def.name, { includeMetadata: true }, async (jobs) => {
      for (const job of jobs) await run(job);
    });
    if (def.schedule) {
      await boss.schedule(def.name, def.schedule.cron, null, def.schedule.tz ? { tz: def.schedule.tz } : {});
    }
    ctx.log.info({ job: def.name, schedule: def.schedule?.cron ?? null }, "job registered");
  }
}
