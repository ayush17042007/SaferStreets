// Trusted-contact link and emails. The raw link token is derived (HMAC of the journey id), so only its
// SHA-256 hash is stored, yet the worker can rebuild the link for the escalation email.
import { createHmac } from "node:crypto";
import type { Env } from "../../config/env.js";
import { sha256Hex } from "../../lib/hash.js";
import type { EmailService } from "../mail/email.service.js";
import { renderJourneyContactEmail, type JourneyContactEmail } from "../mail/templates.js";

export type JourneyEnv = Pick<Env, "APP_ORIGIN" | "SESSION_SECRET">;

export const deriveTrackToken = (secret: string, journeyId: string): string =>
  createHmac("sha256", secret).update(`journey-track:${journeyId}`).digest("base64url");

export const hashTrackToken = (token: string): string => sha256Hex(token);

export const trackUrl = (env: JourneyEnv, journeyId: string) =>
  new URL(`/track/${deriveTrackToken(env.SESSION_SECRET, journeyId)}`, env.APP_ORIGIN).toString();

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const formatIst = (d: Date) => `${IST.format(d)} IST`;
export const firstNameOf = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] || "Your contact";

/** Queues one email to the contact. Returns the email_events id. Throws if it cannot be queued. */
export async function queueContactEmail(
  email: EmailService,
  env: JourneyEnv,
  args: {
    to: string;
    kind: JourneyContactEmail["kind"];
    contactName: string;
    userFullName: string | null;
    destination: string;
    eta: Date;
    journeyId: string;
  },
): Promise<string> {
  const rendered = renderJourneyContactEmail({
    kind: args.kind,
    contactName: args.contactName,
    userFirstName: firstNameOf(args.userFullName),
    destination: args.destination,
    eta: formatIst(args.eta),
    trackUrl: trackUrl(env, args.journeyId),
  });
  return email.enqueue(args.to, `journey-${args.kind}`, rendered);
}
