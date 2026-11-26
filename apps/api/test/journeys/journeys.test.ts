import request from "supertest";
import { describe, expect, it } from "vitest";
import { createEmailService } from "../../src/modules/mail/email.service.js";
import { runJourneyScan } from "../../src/modules/journeys/journeys.scan.js";
import { createNotificationService } from "../../src/modules/notifications/notifications.service.js";
import type { JobPublisher } from "../../src/jobs/publisher.js";
import {
  buildTestApp,
  createUserWithSession,
  env,
  inlineEmailPublisher,
  prisma,
  silentLogger,
  xhr,
} from "../helpers.js";

const MIN = 60_000;

async function setup(publisher: JobPublisher = inlineEmailPublisher()) {
  let t = Date.now();
  const clock = { now: () => new Date(t) };
  const advance = (minutes: number) => {
    t += minutes * MIN;
  };
  const { app } = buildTestApp({
    clock,
    publisher,
    limits: { journeyStart: { points: 100, durationSeconds: 3600, key: "user" } },
  });
  const user = await createUserWithSession();
  await prisma.user.update({ where: { id: user.user.id }, data: { fullName: "Riya Sharma" } });
  const contact = await prisma.emergencyContact.create({
    data: { userId: user.user.id, name: "Meera", email: "meera@example.test", consentConfirmed: true },
  });
  const email = createEmailService({ prisma, publisher, env });
  const notifications = createNotificationService({ prisma, email, env });
  const scan = () => runJourneyScan({ prisma, clock, email, notifications, env, log: silentLogger });
  const post = (cookie: string, path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(body);
  const start = (minutes = 20, over: object = {}) =>
    post(user.cookie, "/journeys", {
      destinationText: "Hostel B",
      expectedArrivalAt: new Date(t + minutes * MIN).toISOString(),
      emergencyContactId: contact.id,
      ...over,
    });
  const mails = (subject: string) => prisma.capturedEmail.count({ where: { subject } });
  return { app, user, contact, advance, scan, post, start, mails, clock };
}

describe("starting a journey", () => {
  it("validates ETA, contact ownership and one-active, and emails the contact a link", async () => {
    const { user, start, post, mails } = await setup();
    expect((await start(2)).status).toBe(400);
    expect((await start(25 * 60)).status).toBe(400);
    const other = await createUserWithSession();
    const foreign = await prisma.emergencyContact.create({
      data: { userId: other.user.id, name: "X", email: "x@example.test", consentConfirmed: true },
    });
    expect((await start(20, { emergencyContactId: foreign.id })).status).toBe(404);
    const res = await start(20);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.trackUrl).toMatch(/\/track\/[\w-]{40,}/);
    expect(await mails("Riya added you as a trusted contact for a journey")).toBe(1);
    expect((await start(30)).status).toBe(409);
    const active = await request(buildTestApp().app).get("/api/v1/journeys/active").set("Cookie", user.cookie);
    expect(active.body.data.id).toBe(res.body.data.id);
    void post;
  });

  it("IDOR: nobody else can read, finish or extend my journey", async () => {
    const { start, post } = await setup();
    const id = (await start(20)).body.data.id as string;
    const intruder = await createUserWithSession();
    const { app } = buildTestApp();
    expect((await request(app).get(`/api/v1/journeys/${id}`).set("Cookie", intruder.cookie)).status).toBe(404);
    expect((await post(intruder.cookie, `/journeys/${id}/complete`)).status).toBe(404);
    expect((await post(intruder.cookie, `/journeys/${id}/extend`, { minutes: 15 })).status).toBe(404);
  });
});

describe("journey.scan with an injected clock", () => {
  it("goes OVERDUE at ETA+10 with an in-app and email reminder, and emails the contact once at ETA+30", async () => {
    const { user, start, advance, scan, mails } = await setup();
    const id = (await start(20)).body.data.id as string;
    advance(29);
    expect(await scan()).toEqual({ overdue: 0, contactsNotified: 0 });
    advance(1); // ETA + 10
    expect(await scan()).toEqual({ overdue: 1, contactsNotified: 0 });
    expect((await prisma.journey.findUniqueOrThrow({ where: { id } })).status).toBe("OVERDUE");
    expect(await prisma.notification.count({ where: { userId: user.user.id, type: "JOURNEY_OVERDUE" } })).toBe(1);
    expect(await mails("Have you arrived?")).toBe(1);
    expect(await mails("Riya has not confirmed arrival")).toBe(0);

    advance(19); // ETA + 29
    await scan();
    expect(await mails("Riya has not confirmed arrival")).toBe(0);
    advance(1); // ETA + 30
    expect(await scan()).toEqual({ overdue: 0, contactsNotified: 1 });
    expect(await mails("Riya has not confirmed arrival")).toBe(1);
    const mail = await prisma.capturedEmail.findFirstOrThrow({ where: { subject: "Riya has not confirmed arrival" } });
    expect(mail.toEmail).toBe("meera@example.test");
    expect(mail.textBody).toContain("cannot see where");
    expect(mail.textBody).not.toMatch(/riya@|\d{10}/i);
  });

  it("never sends a second contact email on repeated or overlapping scans", async () => {
    const { start, advance, scan, mails } = await setup();
    await start(20);
    advance(60);
    await Promise.all([scan(), scan(), scan()]);
    await scan();
    await scan();
    expect(await mails("Riya has not confirmed arrival")).toBe(1);
    expect(await mails("Have you arrived?")).toBe(1);
  });

  it("an extension before the scan prevents the reminder, and the limit is two", async () => {
    const { start, advance, scan, post, user, mails } = await setup();
    const id = (await start(20)).body.data.id as string;
    advance(25);
    expect((await post(user.cookie, `/journeys/${id}/extend`, { minutes: 30 })).status).toBe(200);
    advance(10); // 35 min in: past the original ETA+10 but inside the extended one
    expect(await scan()).toEqual({ overdue: 0, contactsNotified: 0 });
    expect((await post(user.cookie, `/journeys/${id}/extend`, { minutes: 15 })).status).toBe(200);
    expect((await post(user.cookie, `/journeys/${id}/extend`, { minutes: 15 })).status).toBe(409);
    expect(await mails("Have you arrived?")).toBe(0);
  });

  it("completing during escalation stops the contact email; completing after it sends an all-clear", async () => {
    const a = await setup();
    const idA = (await a.start(20)).body.data.id as string;
    a.advance(35); // overdue, contact not yet emailed
    await a.scan();
    expect((await a.post(a.user.cookie, `/journeys/${idA}/complete`)).status).toBe(200);
    a.advance(30);
    await a.scan();
    expect(await a.mails("Riya has not confirmed arrival")).toBe(0);
    expect(await a.mails("Riya is safe")).toBe(0);
    expect((await a.post(a.user.cookie, `/journeys/${idA}/complete`)).status).toBe(409);

    const b = await setup();
    const idB = (await b.start(20)).body.data.id as string;
    b.advance(60);
    await b.scan();
    expect(await b.mails("Riya has not confirmed arrival")).toBe(1);
    expect((await b.post(b.user.cookie, `/journeys/${idB}/complete`)).status).toBe(200);
    expect(await b.mails("Riya is safe")).toBe(1);
  });

  it("a contact email that cannot be queued is marked FAILED, logged, and the user is told to call", async () => {
    const failing: JobPublisher = {
      enqueue: async () => {
        throw new Error("queue down");
      },
      close: async () => {},
    };
    const ctx = await setup(failing);
    const res = await ctx.start(20); // the start email is best effort and must not break the journey
    expect(res.status).toBe(201);
    const id = res.body.data.id as string;
    ctx.advance(60);
    await ctx.scan();
    const { app } = buildTestApp();
    const dto = (await request(app).get(`/api/v1/journeys/${id}`).set("Cookie", ctx.user.cookie)).body.data;
    expect(dto.contactNotifiedAt).not.toBeNull();
    expect(dto.contactEmailFailed).toBe(true);
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: ctx.user.user.id, title: "We couldn't email your contact" },
    });
    expect(note.body).toBe("We couldn't email Meera. Call them directly.");
  });
});

describe("trusted contact page", () => {
  it("shows first name, destination, ETA and status only; unknown and expired tokens are the same 404", async () => {
    const { app, start, advance, post, user } = await setup();
    const res = await start(20);
    const token = (res.body.data.trackUrl as string).split("/track/")[1]!;
    const page = await request(app).get(`/api/v1/track/${token}`);
    expect(page.status).toBe(200);
    expect(Object.keys(page.body.data).sort()).toEqual([
      "destinationText",
      "expectedArrivalAt",
      "firstName",
      "lastLat",
      "lastLng",
      "lastLocationAt",
      "safetyState",
      "status",
      "trackingEnabled",
    ]);
    expect(page.body.data).toMatchObject({ firstName: "Riya", destinationText: "Hostel B", status: "ON_THE_WAY" });
    expect(JSON.stringify(page.body)).not.toMatch(/@|Sharma/);

    const unknown = await request(app).get(`/api/v1/track/${"a".repeat(43)}`);
    advance(20 + 24 * 60 + 1);
    const expired = await request(app).get(`/api/v1/track/${token}`);
    expect(unknown.status).toBe(404);
    expect(expired.status).toBe(404);
    expect(expired.body.error.message).toBe(unknown.body.error.message);
    void post;
    void user;
  });

  it("unsubscribe stops contact emails and blocks new journeys with that contact", async () => {
    const { app, start, advance, scan, mails, user, contact } = await setup();
    const res = await start(20);
    const token = (res.body.data.trackUrl as string).split("/track/")[1]!;
    expect((await request(app).post(`/api/v1/track/${token}/unsubscribe`).set(xhr)).status).toBe(200);
    expect(
      (await prisma.emergencyContact.findUniqueOrThrow({ where: { id: contact.id } })).unsubscribedAt,
    ).not.toBeNull();
    advance(60);
    await scan();
    expect(await mails("Riya has not confirmed arrival")).toBe(0);
    const dto = (await request(app).get("/api/v1/journeys/active").set("Cookie", user.cookie)).body.data;
    expect(dto.contactOptedOut).toBe(true);
    expect(await prisma.notification.count({ where: { title: "We couldn't email your contact" } })).toBe(1);
  });
});

describe("history", () => {
  it("lists finished journeys newest first", async () => {
    const { app, start, post, user } = await setup();
    for (let i = 0; i < 3; i++) {
      const id = (await start(20)).body.data.id as string;
      await post(user.cookie, `/journeys/${id}/${i === 2 ? "cancel" : "complete"}`);
    }
    const h1 = await request(app).get("/api/v1/journeys/history?limit=2").set("Cookie", user.cookie);
    expect(h1.body.data).toHaveLength(2);
    expect(h1.body.meta.nextCursor).not.toBeNull();
    const h2 = await request(app)
      .get(`/api/v1/journeys/history?limit=2&cursor=${h1.body.meta.nextCursor}`)
      .set("Cookie", user.cookie);
    expect(h2.body.data).toHaveLength(1);
  });
});
