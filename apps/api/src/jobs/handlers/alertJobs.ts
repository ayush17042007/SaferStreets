import type { Env } from "../../config/env.js";
import { runAlertExpire, runAlertFanout } from "../../modules/alerts/alerts.fanout.js";
import { createEmailService } from "../../modules/mail/email.service.js";
import { createNotificationService } from "../../modules/notifications/notifications.service.js";
import type { JobPublisher } from "../publisher.js";
import { JOB_NAMES, defineJob } from "../registry.js";

export function createAlertFanoutJob(deps: { env: Env; publisher: JobPublisher }) {
  return defineJob<{ alertId: string }>({
    name: JOB_NAMES.alertFanout,
    retryLimit: 3,
    retryDelaySeconds: 10,
    retryDelayMaxSeconds: 120,
    expireInSeconds: 300,
    handler: async (data, ctx) => {
      const email = createEmailService({ prisma: ctx.prisma, publisher: deps.publisher, env: deps.env });
      const notifications = createNotificationService({ prisma: ctx.prisma, email, env: deps.env });
      const r = await runAlertFanout({ prisma: ctx.prisma, clock: ctx.clock, notifications, alertId: data.alertId });
      ctx.log.info({ alertId: data.alertId, ...r }, "alert fan-out done");
    },
  });
}

export const alertExpireJob = defineJob({
  name: JOB_NAMES.alertExpire,
  schedule: { cron: "*/10 * * * *" },
  retryLimit: 2,
  retryDelaySeconds: 10,
  expireInSeconds: 120,
  handler: async (_data, ctx) => {
    const n = await runAlertExpire(ctx.prisma, ctx.clock);
    if (n > 0) ctx.log.info({ expired: n }, "alerts expired");
  },
});
