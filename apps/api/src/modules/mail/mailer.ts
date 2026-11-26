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
  send(email: OutgoingEmail): Promise<{ providerId?: string }>;
}

// Resend mailer
export function createResendMailer(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): Mailer {
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: "resend",

    async send(email) {
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: opts.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });

      if (!res.ok) {
        throw new Error(`Resend responded ${res.status}`);
      }

      const body = (await res.json()) as { id?: string };

      return body.id ? { providerId: body.id } : {};
    },
  };
}

// SMTP mailer (Brevo / Mailpit)
export function createSmtpMailer(opts: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}): Mailer {
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,

    // Port 465 uses implicit TLS.
    // Port 587 uses STARTTLS.
    secure: opts.port === 465,

    // Authenticate when SMTP credentials are provided.
    ...(opts.user && opts.pass
      ? {
          auth: {
            user: opts.user,
            pass: opts.pass,
          },
        }
      : {}),

    // Allow STARTTLS on port 587.
    requireTLS: opts.port === 587,
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

// Capture mailer (tests)
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

// Mailer factory
export function createMailer(env: Env, prisma: PrismaClient): Mailer {
  const from = env.EMAIL_FROM && env.EMAIL_FROM.trim() !== "" ? env.EMAIL_FROM : DEFAULT_FROM;

  switch (env.EMAIL_TRANSPORT) {
    case "resend":
      return createResendMailer({
        apiKey: env.RESEND_API_KEY ?? "",
        from,
      });

    case "smtp":
      return createSmtpMailer({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from,
      });

    case "capture":
      return createCaptureMailer(prisma);
  }
}
