// email.send (Part B3): one job per email, 5 retries with exponential backoff, writes email_events.
import { open } from "../../lib/crypto.js";
import type { Mailer, OutgoingEmail } from "../../modules/mail/mailer.js";
import { emailHash, type EmailJobData } from "../../modules/mail/email.service.js";
import { JOB_NAMES, defineJob, type JobContext } from "../registry.js";

export interface EmailSendDeps {
  mailer: Mailer;
  /** Secret used to open the sealed payload (OTP_HMAC_SECRET). */
  secret: string;
}

type Ctx = JobContext & { isLastAttempt: boolean };

/** Exported so tests can run it without pg-boss. Idempotent: an already SENT/DELIVERED event is never re-sent. */
export async function sendEmailJob(data: EmailJobData, ctx: Ctx, deps: EmailSendDeps): Promise<void> {
  const { prisma, log } = ctx;
  const event = await prisma.emailEvent.findUnique({ where: { id: data.eventId } });
  if (!event) {
    log.warn({ eventId: data.eventId }, "email event missing, dropping job");
    return;
  }
  if (event.status === "SENT" || event.status === "DELIVERED") return;

  const message = open<OutgoingEmail>(deps.secret, data.sealed);

  const suppressed = await prisma.emailSuppression.findUnique({ where: { emailHash: emailHash(message.to) } });
  if (suppressed) {
    await prisma.emailEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", error: `suppressed: ${suppressed.reason}` },
    });
    return;
  }

  try {
    const { providerId } = await deps.mailer.send(message);
    await prisma.emailEvent.update({
      where: { id: event.id },
      data: { status: "SENT", ...(providerId ? { providerId } : {}), error: null },
    });
  } catch (err) {
    // Never store the recipient or the body in the error text.
    const reason = err instanceof Error ? err.message.slice(0, 200) : "send failed";
    await prisma.emailEvent.update({
      where: { id: event.id },
      data: { status: ctx.isLastAttempt ? "FAILED" : "QUEUED", error: reason },
    });
    if (ctx.isLastAttempt) log.error({ eventId: event.id, template: data.template }, "email failed after all retries");
    throw err;
  }
}

export function createEmailSendJob(deps: EmailSendDeps) {
  return defineJob<EmailJobData>({
    name: JOB_NAMES.emailSend,
    retryLimit: 5,
    retryDelaySeconds: 5,
    retryDelayMaxSeconds: 300,
    expireInSeconds: 60,
    // The payload is sealed, but still drop finished jobs quickly.
    deleteAfterSeconds: 3600,
    handler: (data, ctx) => sendEmailJob(data, ctx, deps),
  });
}
