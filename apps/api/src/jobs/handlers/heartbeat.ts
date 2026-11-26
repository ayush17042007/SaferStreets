// scheduler.heartbeat (Part B3): every minute, upsert heartbeats(name='scheduler').
// /health/ready and the external uptime alarm treat a heartbeat older than 3 minutes as down.
import { HEARTBEAT_NAME } from "../../modules/health/health.service.js";
import { JOB_NAMES, defineJob, type JobContext } from "../registry.js";

/** Idempotent: repeating it only moves last_seen_at forward to "now". */
export async function writeHeartbeat(ctx: Pick<JobContext, "prisma" | "clock">, name = HEARTBEAT_NAME): Promise<Date> {
  const now = ctx.clock.now();
  await ctx.prisma.heartbeat.upsert({
    where: { name },
    create: { name, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
  return now;
}

export const heartbeatJob = defineJob({
  name: JOB_NAMES.schedulerHeartbeat,
  schedule: { cron: "* * * * *" },
  retryLimit: 2,
  retryDelaySeconds: 5,
  retryDelayMaxSeconds: 30,
  expireInSeconds: 50,
  handler: async (_data, ctx) => {
    await writeHeartbeat(ctx);
  },
});
