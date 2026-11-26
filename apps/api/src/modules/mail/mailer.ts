// Mail adapter (Part B8). `resend` in production, `smtp` for local Mailpit, `capture` for tests.
import nodemailer from "nodemailer";
import type { Env } from "../../config/env.js";
import type { PrismaClient } from "../../lib/prisma.js";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  readonly name: "resend" | "smtp" | "capture";
  /** Resolves with the provider message id (when there is one). Throws on failure so the job retries. */
  send(email: OutgoingEmail): Promise<{ providerId?: string }>;
}

export function createResendMailer(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): Mailer {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: "resend",
    async send(email) {
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: opts.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      const body = (await res.json()) as { id?: string };
      return body.id ? { providerId: body.id } : {};
    },
  };
}

// apps/api/src/modules/mail/mailer.ts
export function createSmtpMailer(opts: { host: string; port: number; from: string }): Mailer {
  // Mailpit does not use TLS or authentication.
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false, // no TLS
    auth: undefined, // no auth
    // Ensure the client never attempts STARTTLS
    tls: { rejectUnauthorized: false },
  });

  return {
    name: "smtp",
    async send(email) {
      const info = await transport.sendMail({
        from: opts.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      return { providerId: info.messageId };
    },
  };
}

export const DEFAULT_FROM = "SaferStreets <no-reply@saferstreets.example>";

/** Stores outgoing emails in the `captured_emails` table instead of sending them. Used in tests and dev. */
export function createCaptureMailer(prisma: PrismaClient): Mailer {
  return {
    name: "capture",
    async send(email) {
      const row = await prisma.capturedEmail.create({
        data: {
          toEmail: email.to,
          subject: email.subject,
          htmlBody: email.html,
          textBody: email.text,
        },
      });
      return { providerId: row.id };
    },
  };
}

export function createMailer(env: Env, prisma: PrismaClient): Mailer {
  const from = env.EMAIL_FROM && env.EMAIL_FROM.trim() !== "" ? env.EMAIL_FROM : DEFAULT_FROM;
  switch (env.EMAIL_TRANSPORT) {
    case "resend":
      return createResendMailer({ apiKey: env.RESEND_API_KEY ?? "", from });
    case "smtp":
      return createSmtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, from });
    case "capture":
      return createCaptureMailer(prisma);
  }
}
