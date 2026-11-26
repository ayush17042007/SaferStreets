import request from "supertest";
import { describe, expect, it } from "vitest";
import { createEmailService } from "../../src/modules/mail/email.service.js";
import { createNotificationService } from "../../src/modules/notifications/notifications.service.js";
import { buildTestApp, env, inlineEmailPublisher, prisma, xhr } from "../helpers.js";
import { loginOnboarded } from "../authHelpers.js";

function service() {
  const email = createEmailService({ prisma, publisher: inlineEmailPublisher(), env });
  return createNotificationService({ prisma, email, env });
}

async function user(email: string, name = "Riya Sharma") {
  const { app } = buildTestApp();
  const cookie = await loginOnboarded(app, email, name);
  return { app, cookie, id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}

describe("notificationService.notify", () => {
  it("creates an in-app row and an email, linked by notification id", async () => {
    const { id } = await user("riya@example.test");
    const nid = await service().notify({
      userId: id,
      type: "REPORT_STATUS",
      module: "saferoute",
      title: "Your report was verified",
      body: "Done.",
      link: "/saferoute/abc",
    });
    const mail = await prisma.capturedEmail.findFirstOrThrow({ where: { subject: "Your report was verified" } });
    expect(mail.textBody).toContain("/saferoute/abc");
    expect(mail.textBody).toContain("call 112");
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: nid } })).emailSentAt).not.toBeNull();
    expect(await prisma.emailEvent.count({ where: { notificationId: nid } })).toBe(1);
  });

  it("skips the email when the module preference is off, but still creates the in-app row", async () => {
    const { app, cookie, id } = await user("riya@example.test");
    await request(app)
      .patch("/api/v1/me")
      .set(xhr)
      .set("Cookie", cookie)
      .send({ emailPrefs: { saferoute: false, automate: true, safealert: true } });
    await service().notify({ userId: id, type: "REPORT_STATUS", module: "saferoute", title: "Quiet one", body: "x" });
    expect(await prisma.notification.count({ where: { userId: id } })).toBe(1);
    expect(await prisma.capturedEmail.count({ where: { subject: "Quiet one" } })).toBe(0);
  });

  it("JourneyGuard safety notifications ignore email preferences", async () => {
    const { app, cookie, id } = await user("riya@example.test");
    await request(app)
      .patch("/api/v1/me")
      .set(xhr)
      .set("Cookie", cookie)
      .send({ emailPrefs: { saferoute: false, automate: false, safealert: false } });
    await service().notify({
      userId: id,
      type: "JOURNEY_OVERDUE",
      module: "journeyguard",
      title: "Have you arrived?",
      body: "x",
    });
    expect(await prisma.capturedEmail.count({ where: { subject: "Have you arrived?" } })).toBe(1);
  });

  it("does not email suspended users, and a rolled-back transaction sends nothing", async () => {
    const { id } = await user("riya@example.test");
    const s = service();
    await prisma.user.update({ where: { id }, data: { status: "SUSPENDED" } });
    await s.notify({ userId: id, type: "SYSTEM", module: "system", title: "For suspended", body: "x" });
    expect(await prisma.capturedEmail.count({ where: { subject: "For suspended" } })).toBe(0);
    await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
    await expect(
      prisma.$transaction(async (tx) => {
        await s.create(tx, { userId: id, type: "SYSTEM", module: "system", title: "Rolled back", body: "x" });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await prisma.notification.count({ where: { title: "Rolled back" } })).toBe(0);
    expect(await prisma.capturedEmail.count({ where: { subject: "Rolled back" } })).toBe(0);
  });
});

describe("notification endpoints", () => {
  it("lists newest first with cursor pagination, counts unread, marks read, marks all read", async () => {
    const { app, cookie, id } = await user("riya@example.test");
    const s = service();
    for (let i = 0; i < 5; i++)
      await s.notify({ userId: id, type: "SYSTEM", module: "system", title: `Note ${i}`, body: "b" });

    expect((await request(app).get("/api/v1/notifications/unread-count").set("Cookie", cookie)).body.data.count).toBe(
      5,
    );
    const p1 = await request(app).get("/api/v1/notifications").query({ limit: 2 }).set("Cookie", cookie);
    expect(p1.body.data.map((n: { title: string }) => n.title)).toEqual(["Note 4", "Note 3"]);
    const p2 = await request(app)
      .get("/api/v1/notifications")
      .query({ limit: 2, cursor: p1.body.meta.nextCursor })
      .set("Cookie", cookie);
    expect(p2.body.data.map((n: { title: string }) => n.title)).toEqual(["Note 2", "Note 1"]);

    const first = p1.body.data[0].id as string;
    expect(
      (await request(app).patch(`/api/v1/notifications/${first}/read`).set(xhr).set("Cookie", cookie)).status,
    ).toBe(200);
    expect((await request(app).get("/api/v1/notifications/unread-count").set("Cookie", cookie)).body.data.count).toBe(
      4,
    );
    const unread = await request(app).get("/api/v1/notifications").query({ unread: "true" }).set("Cookie", cookie);
    expect(unread.body.data).toHaveLength(4);
    expect(
      (await request(app).post("/api/v1/notifications/read-all").set(xhr).set("Cookie", cookie)).body.data.updated,
    ).toBe(4);
    expect((await request(app).get("/api/v1/notifications/unread-count").set("Cookie", cookie)).body.data.count).toBe(
      0,
    );
  });

  it("IDOR: nobody reads or marks someone else's notification", async () => {
    const a = await user("riya@example.test");
    const b = await user("arjun@example.test", "Arjun K");
    const nid = await service().notify({ userId: a.id, type: "SYSTEM", module: "system", title: "Private", body: "b" });
    expect((await request(b.app).get("/api/v1/notifications").set("Cookie", b.cookie)).body.data).toEqual([]);
    expect(
      (await request(b.app).patch(`/api/v1/notifications/${nid}/read`).set(xhr).set("Cookie", b.cookie)).status,
    ).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: nid } })).readAt).toBeNull();
    expect((await request(b.app).get("/api/v1/notifications")).status).toBe(401);
  });
});
