// Branded HTML + plain-text templates (Part B8). Email clients ignore CSS variables and classes,
// so these inline the Lamplight values from the design tokens in apps/web via literal constants here.
// Keep the palette in sync with apps/web/src/design/tokens.ts (ink, amber, cream, line).
import { OTP_EXPIRY_MINUTES } from "@saferstreets/shared";

const C = { ink: "#111A3B", amber: "#FFB020", cream: "#FAF7F2", line: "#E8E3D9", muted: "#5A6385" } as const;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:${C.cream};font-family:Inter,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
<tr><td style="padding:0 0 16px;font-weight:600;font-size:18px">
<span style="display:inline-block;width:28px;height:28px;border-radius:9px;background:${C.ink};color:${C.amber};text-align:center;line-height:28px;vertical-align:middle">&#10003;</span>
<span style="vertical-align:middle;margin-left:8px">SaferStreets</span></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${C.line};border-radius:16px;padding:24px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:28px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:16px;color:${C.muted}">SaferStreets is not an emergency service. If anyone is in danger, call 112 first.</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderOtpEmail(code: string): RenderedEmail {
  const subject = `Your SaferStreets code is ${code}`;
  const html = layout(
    "Your log in code",
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px">Enter this code to log in or sign up. It works once and expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
<p style="margin:0 0 16px;font-size:32px;line-height:40px;font-weight:600;letter-spacing:6px;background:${C.cream};border-radius:12px;padding:12px 16px;text-align:center">${esc(code)}</p>
<p style="margin:0;font-size:14px;line-height:20px;color:${C.muted}">If you didn't ask for this, you can ignore this email. Nobody can log in without the code.</p>`,
  );
  const text = `Your SaferStreets log in code: ${code}\n\nIt works once and expires in ${OTP_EXPIRY_MINUTES} minutes.\nIf you didn't ask for this, you can ignore this email.\n\nSaferStreets is not an emergency service. If anyone is in danger, call 112 first.\n`;
  return { subject, html, text };
}

/** In-app notification mirrored by email (the per-module preference decides if it is sent). */
export function renderNotificationEmail(opts: { title: string; body: string; url?: string }): RenderedEmail {
  const link = opts.url
    ? `<p style="margin:16px 0 0"><a href="${esc(opts.url)}" style="color:${C.ink};font-weight:600">Open in SaferStreets</a></p>`
    : "";
  const html = layout(opts.title, `<p style="margin:0;font-size:16px;line-height:24px">${esc(opts.body)}</p>${link}`);
  const text = `${opts.title}\n\n${opts.body}\n${opts.url ? `\nOpen in SaferStreets: ${opts.url}\n` : ""}\nSaferStreets is not an emergency service. If anyone is in danger, call 112 first.\n`;
  return { subject: opts.title, html, text };
}

export interface JourneyContactEmail {
  kind: "start" | "escalation" | "all-clear";
  contactName: string;
  userFirstName: string;
  destination: string;
  /** Expected arrival, already formatted in India time. */
  eta: string;
  trackUrl: string;
}

/** Emails to a trusted contact. Honest wording: no live location, no emergency service. */
export function renderJourneyContactEmail(o: JourneyContactEmail): RenderedEmail {
  const who = o.userFirstName;
  const copy = {
    start: {
      subject: `${who} added you as a trusted contact for a journey`,
      title: `${who} started a journey`,
      lines: [
        `${who} is travelling to ${o.destination} and expects to arrive by ${o.eta}.`,
        `You are getting this because ${who} chose you as a trusted contact. If ${who} has not marked the journey as finished well after that time, we will email you once more.`,
        "SaferStreets does not track anyone's location. You can see only the expected arrival time and whether the journey is still open.",
      ],
    },
    escalation: {
      subject: `${who} has not confirmed arrival`,
      title: `${who} has not confirmed arrival`,
      lines: [
        `${who} expected to arrive at ${o.destination} by ${o.eta} and has not marked the journey as finished.`,
        `Please try calling or messaging ${who} now. SaferStreets cannot see where ${who} is. If you think ${who} is in danger, call 112.`,
        "You will not get another email about this journey.",
      ],
    },
    "all-clear": {
      subject: `${who} is safe`,
      title: `${who} has arrived`,
      lines: [`${who} marked the journey to ${o.destination} as finished. No further action is needed.`],
    },
  }[o.kind];
  const link = `<p style="margin:16px 0 0"><a href="${esc(o.trackUrl)}" style="color:${C.ink};font-weight:600">Open the journey page</a></p>`;
  const html = layout(
    copy.title,
    `<p style="margin:0 0 12px;font-size:16px;line-height:24px">Hi ${esc(o.contactName)},</p>${copy.lines
      .map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px">${esc(l)}</p>`)
      .join(
        "",
      )}${link}<p style="margin:16px 0 0;font-size:14px;line-height:20px;color:${C.muted}">You can stop these emails from the journey page.</p>`,
  );
  const text = `Hi ${o.contactName},\n\n${copy.lines.join("\n\n")}\n\nJourney page and opt out: ${o.trackUrl}\n\nSaferStreets is not an emergency service. If anyone is in danger, call 112 first.\n`;
  return { subject: copy.subject, html, text };
}
