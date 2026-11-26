// journey.scan (every minute). Safety-critical, so each journey is handled in its own transaction:
// lock the row (FOR UPDATE SKIP LOCKED so overlapping scans never double-process), re-read it, then act.
//   ETA + 10 min        -> status OVERDUE, in-app + email reminder to the user
//   ETA + escalation    -> one email to the trusted contact, exactly once (contact_notified_at)
// Emails are queued after the transaction commits, so a rollback never sends anything.
import { OVERDUE_AFTER_MINUTES } from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { EmailService } from "../mail/email.service.js";
import type { NotificationService } from "../notifications/notifications.service.js";
import { queueContactEmail, type JourneyEnv } from "./journeys.mail.js";

const MIN_MS = 60_000;

export interface ScanDeps {
  prisma: PrismaClient;
  clock: Clock;
  email: EmailService;
  notifications: NotificationService;
  env: JourneyEnv;
  log: Logger;
}

export async function runJourneyScan(deps: ScanDeps): Promise<{ overdue: number; contactsNotified: number }> {
  const { prisma, clock, log } = deps;
  const now = clock.now();
  const fiveMinAgo = new Date(now.getTime() - 5 * MIN_MS);
  const due = await prisma.journey.findMany({
    where: {
      status: { in: ["ACTIVE", "OVERDUE"] },
      OR: [
        { expectedArrivalAt: { lte: new Date(now.getTime() - OVERDUE_AFTER_MINUTES * MIN_MS) } },
        {
          trackingEnabled: true,
          safetyState: "NORMAL",
          OR: [{ lastLocationAt: { lte: fiveMinAgo } }, { lastLocationAt: null, startedAt: { lte: fiveMinAgo } }],
        },
      ],
    },
    select: { id: true },
    take: 200,
  });
  let overdue = 0;
  let contactsNotified = 0;
  for (const { id } of due) {
    try {
      const r = await processOne(deps, id, now);
      if (r.overdue) overdue++;
      if (r.contactNotified) contactsNotified++;
    } catch (err) {
      // One bad journey must not stop the rest. The next scan retries it.
      log.error({ err, journeyId: id, safetyCritical: true }, "journey scan failed for one journey");
    }
  }
  return { overdue, contactsNotified };
}

async function processOne(deps: ScanDeps, id: string, now: Date) {
  const { prisma } = deps;
  const after: Array<() => Promise<void>> = [];
  let overdue = false;
  let contactNotified = false;

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM journeys WHERE id = ${id}::uuid AND status IN ('ACTIVE','OVERDUE') FOR UPDATE SKIP LOCKED`;
    if (locked.length === 0) return; // finished, or another scan holds it
    const j = await tx.journey.findUnique({
      where: { id },
      include: { emergencyContact: true, user: { select: { id: true, fullName: true } } },
    });
    if (!j || (j.status !== "ACTIVE" && j.status !== "OVERDUE")) return;
    const eta = j.expectedArrivalAt.getTime();
    let status = j.status;

    if (status === "ACTIVE" && now.getTime() >= eta + OVERDUE_AFTER_MINUTES * MIN_MS) {
      await tx.journey.update({ where: { id }, data: { status: "OVERDUE", overdueAt: now } });
      await tx.journeyEvent.create({ data: { journeyId: id, type: "REMINDER_SENT", meta: {} } });
      const { flush } = await deps.notifications.create(tx, {
        userId: j.userId,
        type: "JOURNEY_OVERDUE",
        module: "journeyguard",
        title: "Have you arrived?",
        body: `You expected to reach ${j.destinationText} by now. Mark the journey as finished, or extend it. If nothing changes, we will email ${j.emergencyContact?.name ?? "your trusted contact"} once.`,
        link: "/journeyguard",
      });
      after.push(flush);
      status = "OVERDUE";
      overdue = true;
    }

    // Check loss of live location updates (> 5 min stale while trackingEnabled).
    const lastSignal = j.lastLocationAt ?? j.startedAt;
    if (j.trackingEnabled && j.safetyState === "NORMAL" && now.getTime() - lastSignal.getTime() >= 5 * MIN_MS) {
      const alreadyLost = await tx.journeyEvent.findFirst({ where: { journeyId: id, type: "LOST_SIGNAL" } });
      if (!alreadyLost) {
        await tx.journey.update({ where: { id }, data: { safetyState: "LOST_SIGNAL" } });
        await tx.journeyEvent.create({
          data: { journeyId: id, type: "LOST_SIGNAL", meta: { lastSignalAt: lastSignal.toISOString() } },
        });
        const { flush } = await deps.notifications.create(tx, {
          userId: j.userId,
          type: "JOURNEY_OVERDUE",
          module: "journeyguard",
          title: "Location updates paused",
          body: `We haven't received a location update for your journey to ${j.destinationText} in over 5 minutes.`,
          link: `/journeyguard/${id}`,
        });
        after.push(flush);
      }
    }

    if (status === "OVERDUE" && j.contactNotifiedAt === null && now.getTime() >= eta + j.escalationMinutes * MIN_MS) {
      const contact = j.emergencyContact;
      await tx.journey.update({ where: { id }, data: { contactNotifiedAt: now } });
      contactNotified = true;
      if (!contact || contact.unsubscribedAt !== null) {
        // Nothing can be sent. Record it and tell the user to call, so it is never silent.
        await tx.journeyEvent.create({
          data: { journeyId: id, type: "CONTACT_NOTIFIED", meta: { delivery: contact ? "OPTED_OUT" : "NO_CONTACT" } },
        });
        const { flush } = await deps.notifications.create(tx, {
          userId: j.userId,
          type: "JOURNEY_OVERDUE",
          module: "journeyguard",
          title: "We couldn't email your contact",
          body: `We couldn't email ${contact?.name ?? "your trusted contact"}. Call them directly.`,
          link: "/journeyguard",
        });
        after.push(flush);
      } else {
        const ev = await tx.journeyEvent.create({
          data: { journeyId: id, type: "CONTACT_NOTIFIED", meta: { delivery: "QUEUING" } },
        });
        after.push(async () => {
          try {
            const emailEventId = await queueContactEmail(deps.email, deps.env, {
              to: contact.email,
              kind: "escalation",
              contactName: contact.name,
              userFullName: j.user.fullName,
              destination: j.destinationText,
              eta: j.expectedArrivalAt,
              journeyId: id,
            });
            await prisma.journeyEvent.update({
              where: { id: ev.id },
              data: { meta: { delivery: "QUEUED", emailEventId } },
            });
          } catch (err) {
            deps.log.error({ err, journeyId: id, safetyCritical: true }, "could not queue the trusted contact email");
            await prisma.journeyEvent.update({ where: { id: ev.id }, data: { meta: { delivery: "FAILED" } } });
            const { id: nid, flush } = await deps.notifications.create(prisma, {
              userId: j.userId,
              type: "JOURNEY_OVERDUE",
              module: "journeyguard",
              title: "We couldn't email your contact",
              body: `We couldn't email ${contact.name}. Call them directly.`,
              link: "/journeyguard",
            });
            void nid;
            await flush().catch(() => undefined); // the in-app row is the point; the email may also be down
          }
        });
      }
    }
  });

  // Each follow-up is independent: a failing reminder email must never stop the contact email.
  for (const f of after) {
    try {
      await f();
    } catch (err) {
      deps.log.error({ err, journeyId: id, safetyCritical: true }, "journey follow-up failed");
    }
  }
  return { overdue, contactNotified };
}
