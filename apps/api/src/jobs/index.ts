import type { Env } from "../config/env.js";
import { createMailer } from "../modules/mail/mailer.js";
import type { PrismaClient } from "../lib/prisma.js";
import { createAlertFanoutJob, alertExpireJob } from "./handlers/alertJobs.js";
import { cleanupNightlyJob } from "./handlers/cleanupNightly.js";
import { createEmailSendJob } from "./handlers/emailSend.js";
import { heartbeatJob } from "./handlers/heartbeat.js";
import { createJourneyScanJob } from "./handlers/journeyScan.js";
import { rideLifecycleJob } from "./handlers/rideLifecycle.js";
import type { JobPublisher } from "./publisher.js";
import type { JobDefinition } from "./registry.js";

/** All jobs the worker runs. Later prompts append here. */
export function buildJobs(env: Env, prisma: PrismaClient, publisher: JobPublisher): JobDefinition<object>[] {
  const email = createEmailSendJob({ mailer: createMailer(env, prisma), secret: env.OTP_HMAC_SECRET });
  return [
    heartbeatJob,
    email,
    rideLifecycleJob,
    createJourneyScanJob({ env, publisher }),
    createAlertFanoutJob({ env, publisher }),
    alertExpireJob,
    cleanupNightlyJob,
  ] as unknown as JobDefinition<object>[];
}
