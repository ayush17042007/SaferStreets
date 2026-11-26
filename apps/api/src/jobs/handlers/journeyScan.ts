import type { Env } from "../../config/env.js";
import { createEmailService } from "../../modules/mail/email.service.js";
import { runJourneyScan } from "../../modules/journeys/journeys.scan.js";
import { createNotificationService } from "../../modules/notifications/notifications.service.js";
import type { JobPublisher } from "../publisher.js";
import { JOB_NAMES, defineJob } from "../registry.js";

export function createJourneyScanJob(deps: { env: Env; publisher: JobPublisher }) {
  return defineJob({
    name: JOB_NAMES.journeyScan,
    schedule: { cron: "* * * * *" },
    retryLimit: 2,
    retryDelaySeconds: 5,
    retryDelayMaxSeconds: 30,
    expireInSeconds: 55,
    handler: async (_data, ctx) => {
      const email = createEmailService({ prisma: ctx.prisma, publisher: deps.publisher, env: deps.env });
      const notifications = createNotificationService({ prisma: ctx.prisma, email, env: deps.env });
      const r = await runJourneyScan({
        prisma: ctx.prisma,
        clock: ctx.clock,
        email,
        notifications,
        env: deps.env,
        log: ctx.log,
      });
      if (r.overdue || r.contactsNotified) ctx.log.info(r, "journey scan acted");
    },
  });
}
