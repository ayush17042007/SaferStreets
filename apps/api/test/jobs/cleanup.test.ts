import { describe, expect, it } from "vitest";
import { cleanupNightlyJob, runNightlyCleanup } from "../../src/jobs/handlers/cleanupNightly.js";
import { JOB_NAMES } from "../../src/jobs/registry.js";
import { fixedClock } from "../../src/lib/clock.js";
import { prisma } from "../helpers.js";

const DAY_MS = 24 * 3_600_000;

describe("cleanup.nightly", () => {
  it("is scheduled for 02:00 IST with retries", () => {
    expect(cleanupNightlyJob.name).toBe(JOB_NAMES.cleanupNightly);
    expect(cleanupNightlyJob.schedule).toEqual({ cron: "0 2 * * *", tz: "Asia/Kolkata" });
    expect(cleanupNightlyJob.retryLimit).toBeGreaterThanOrEqual(1);
  });

  it("auto-restores expired suspensions, scrubs old deleted users, and enforces retention rules idempotently", async () => {
    const now = new Date("2026-11-26T02:00:00+05:30");
    const clock = fixedClock(now);
    const ago = (ms: number) => new Date(now.getTime() - ms);

    const expiredSuspended = await prisma.user.create({
      data: {
        email: "expired-susp@example.test",
        status: "SUSPENDED",
        prefs: { suspendedUntil: ago(60_000).toISOString(), keepMe: true },
      },
    });
    const activeSuspended = await prisma.user.create({
      data: {
        email: "active-susp@example.test",
        status: "SUSPENDED",
        prefs: { suspendedUntil: new Date(now.getTime() + DAY_MS).toISOString() },
      },
    });
    const oldDeleted = await prisma.user.create({
      data: {
        email: "old-deleted@example.test",
        fullName: "Old Deleted",
        phone: "9876543210",
        status: "DELETED",
        deletedAt: ago(31 * DAY_MS),
      },
    });

    await prisma.otpCode.createMany({
      data: [
        { email: "a@example.test", codeHash: "h1", expiresAt: ago(25 * 3_600_000) },
        { email: "b@example.test", codeHash: "h2", expiresAt: ago(2 * 3_600_000) },
      ],
    });
    await prisma.session.createMany({
      data: [
        { userId: expiredSuspended.id, tokenHash: "s1", expiresAt: ago(31 * DAY_MS) },
        { userId: expiredSuspended.id, tokenHash: "s2", expiresAt: new Date(now.getTime() + DAY_MS) },
      ],
    });
    await prisma.notification.createMany({
      data: [
        { userId: expiredSuspended.id, type: "SYSTEM", title: "Old", body: "Old", createdAt: ago(61 * DAY_MS) },
        { userId: expiredSuspended.id, type: "SYSTEM", title: "New", body: "New", createdAt: ago(5 * DAY_MS) },
      ],
    });
    await prisma.upload.create({
      data: {
        userId: expiredSuspended.id,
        purpose: "AVATAR",
        storageKey: "k-stale",
        status: "PENDING",
        createdAt: ago(25 * 3_600_000),
      },
    });

    const first = await runNightlyCleanup(prisma, clock);
    expect(first.restoredUsers).toBe(1);
    expect(first.scrubbedUsers).toBe(1);
    expect(first.otpCodes).toBe(1);
    expect(first.sessions).toBe(1);
    expect(first.notifications).toBe(1);
    expect(first.orphanedUploads).toBe(1);

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: expiredSuspended.id } });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.prefs).toEqual({ keepMe: true });

    const stillSusp = await prisma.user.findUniqueOrThrow({ where: { id: activeSuspended.id } });
    expect(stillSusp.status).toBe("SUSPENDED");

    const scrubbed = await prisma.user.findUniqueOrThrow({ where: { id: oldDeleted.id } });
    expect(scrubbed.fullName).toBeNull();
    expect(scrubbed.phone).toBeNull();
    expect(scrubbed.email).toBe(`deleted-${oldDeleted.id}@deleted.invalid`);

    // Idempotent second run.
    const second = await runNightlyCleanup(prisma, clock);
    expect(second.restoredUsers).toBe(0);
    expect(second.scrubbedUsers).toBe(0);
    expect(second.otpCodes).toBe(0);
    expect(second.sessions).toBe(0);
    expect(second.notifications).toBe(0);
    expect(second.orphanedUploads).toBe(0);
  });
});
