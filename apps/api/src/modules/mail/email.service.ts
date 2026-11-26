// Enqueues emails (never sends on a request path). One `email.send` job per email.
import type { Env } from "../../config/env.js";
import { seal } from "../../lib/crypto.js";
import { sha256Hex } from "../../lib/hash.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { JobPublisher } from "../../jobs/publisher.js";
import { JOB_NAMES } from "../../jobs/registry.js";
import { renderOtpEmail, type RenderedEmail } from "./templates.js";

export interface EmailJobData {
  /** Sealed (AES-GCM) { to, subject, html, text }: nothing sensitive is stored in clear in the queue. */
  sealed: string;
  eventId: string;
  template: string;
}

export const emailHash = (address: string) => sha256Hex(address.trim().toLowerCase());

export function createEmailService(deps: {
  prisma: PrismaClient;
  publisher: JobPublisher;
  env: Pick<Env, "OTP_HMAC_SECRET">;
}) {
  async function enqueue(
    to: string,
    template: string,
    rendered: RenderedEmail,
    notificationId?: string,
  ): Promise<string> {
    const event = await deps.prisma.emailEvent.create({
      data: { toHash: emailHash(to), template, status: "QUEUED", ...(notificationId ? { notificationId } : {}) },
    });
    const data: EmailJobData = {
      sealed: seal(deps.env.OTP_HMAC_SECRET, {
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
      eventId: event.id,
      template,
    };
    await deps.publisher.enqueue(JOB_NAMES.emailSend, data);
    return event.id;
  }

  return {
    enqueue,
    sendOtp: (to: string, code: string) => enqueue(to, "otp", renderOtpEmail(code)),
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
