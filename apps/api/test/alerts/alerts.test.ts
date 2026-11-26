import request from "supertest";
import { describe, expect, it } from "vitest";
import { runAlertExpire, runAlertFanout } from "../../src/modules/alerts/alerts.fanout.js";
import { createEmailService } from "../../src/modules/mail/email.service.js";
import { createNotificationService } from "../../src/modules/notifications/notifications.service.js";
import { systemClock } from "../../src/lib/clock.js";
import { createInlinePublisher } from "../../src/jobs/publisher.js";
import { buildTestApp, createUserWithSession, env, inlineEmailPublisher, prisma, xhr } from "../helpers.js";

const DAY = 86_400_000;
const body = {
  category: "ROAD_ACCIDENT",
  description: "Two vehicles collided near the main gate",
  latitude: 25.1425,
  longitude: 75.8,
  addressText: "Main gate, Kota",
};

/** A user old enough to post (created `ageDays` ago). */
async function member(ageDays = 30, role: "USER" | "MODERATOR" | "ADMIN" = "USER") {
  const u = await createUserWithSession({ role });
  await prisma.user.update({ where: { id: u.user.id }, data: { createdAt: new Date(Date.now() - ageDays * DAY) } });
  return u;
}

function setup() {
  const publisher = createInlinePublisher();
  const { app } = buildTestApp({ publisher: Object.assign(publisher, {}) });
  const post = (cookie: string, path: string, b: object = {}) =>
    request(app).post(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(b);
  const get = (cookie: string | null, path: string) => {
    const r = request(app).get(`/api/v1${path}`);
    return cookie ? r.set("Cookie", cookie) : r;
  };
  const put = (cookie: string, path: string, b: object) =>
    request(app).put(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(b);
  const patch = (cookie: string, path: string, b: object) =>
    request(app).patch(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(b);
  return { app, publisher, post, get, put, patch };
}

describe("posting alerts", () => {
  it("needs a verified email, an account at least 24 h old, and no suspension", async () => {
    const { post } = setup();
    const fresh = await createUserWithSession();
    const r1 = await post(fresh.cookie, "/alerts", body);
    expect(r1.status).toBe(403);
    expect(r1.body.error.message).toContain("24 hours");

    const unverified = await member();
    await prisma.user.update({ where: { id: unverified.user.id }, data: { emailVerifiedAt: null } });
    expect((await post(unverified.cookie, "/alerts", body)).body.error.message).toBe(
      "Verify your email to post alerts.",
    );

    const paused = await member();
    await prisma.user.update({
      where: { id: paused.user.id },
      data: { alertsSuspendedUntil: new Date(Date.now() + DAY) },
    });
    expect((await post(paused.cookie, "/alerts", body)).status).toBe(403);

    const ok = await member();
    const res = await post(ok.cookie, "/alerts", body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ unverified: true, status: "ACTIVE", isMine: true });
  });

  it("suppresses a duplicate (same category, 200 m, 30 min) but not other categories or distant spots", async () => {
    const { post } = setup();
    const a = await member();
    const b = await member();
    expect((await post(a.cookie, "/alerts", body)).status).toBe(201);
    expect((await post(b.cookie, "/alerts", { ...body, latitude: 25.1435 })).status).toBe(409);
    expect((await post(b.cookie, "/alerts", { ...body, category: "FIRE" })).status).toBe(201);
    expect((await post(b.cookie, "/alerts", { ...body, latitude: 25.2 })).status).toBe(201);
  });

  it("limits posting to 3 per hour", async () => {
    const { post } = setup();
    const a = await member();
    for (let i = 0; i < 3; i++) {
      expect((await post(a.cookie, "/alerts", { ...body, latitude: 25.1 + i * 0.05 })).status).toBe(201);
    }
    expect((await post(a.cookie, "/alerts", { ...body, latitude: 25.5 })).status).toBe(429);
  });

  it("holds an alert from a 1-7 day old account for review: hidden, no fan-out, until verified", async () => {
    const { post, get, patch, publisher } = setup();
    const newish = await member(3);
    const other = await member();
    const mod = await member(60, "MODERATOR");
    const id = (await post(newish.cookie, "/alerts", body)).body.data.id as string;
    expect(publisher.jobs).toHaveLength(0);
    expect((await get(other.cookie, "/alerts")).body.data).toHaveLength(0);
    expect((await get(other.cookie, `/alerts/${id}`)).status).toBe(404);
    expect((await get(newish.cookie, "/alerts")).body.data[0].awaitingReview).toBe(true);

    expect(
      (
        await patch(mod.cookie, `/admin/alerts/${id}/status`, {
          status: "VERIFIED",
          reason: "Checked with the campus office",
        })
      ).status,
    ).toBe(200);
    expect(publisher.jobs.filter((j) => j.name === "alert.fanout")).toHaveLength(1);
    const seen = (await get(other.cookie, `/alerts/${id}`)).body.data;
    expect(seen).toMatchObject({ status: "VERIFIED", unverified: false });
  });
});

describe("guest projection", () => {
  it("rounds coordinates and hides description and address", async () => {
    const { post, get } = setup();
    const a = await member();
    await post(a.cookie, "/alerts", body);
    const g = (await get(null, "/alerts")).body.data[0];
    expect(g).toMatchObject({ description: null, addressText: null, coarseLocation: true });
    expect(Math.abs(g.latitude - body.latitude)).toBeLessThan(0.003);
    expect(g.latitude).not.toBe(body.latitude);
    const signed = (await get(a.cookie, "/alerts")).body.data[0];
    expect(signed).toMatchObject({ description: body.description, latitude: body.latitude });
    expect(JSON.stringify(g)).not.toContain(a.user.id);
  });
});

describe("votes and resolve", () => {
  it("one vote per user that can change; not on your own alert; counts stay consistent in parallel", async () => {
    const { post, get } = setup();
    const author = await member();
    const id = (await post(author.cookie, "/alerts", body)).body.data.id as string;
    expect((await post(author.cookie, `/alerts/${id}/vote`, { vote: "CONFIRM" })).status).toBe(403);
    const voters = await Promise.all(Array.from({ length: 6 }, () => member()));
    await Promise.all(voters.map((v) => post(v.cookie, `/alerts/${id}/vote`, { vote: "CONFIRM" })));
    expect((await get(voters[0]!.cookie, `/alerts/${id}`)).body.data).toMatchObject({
      confirmCount: 6,
      disputeCount: 0,
      myVote: "CONFIRM",
    });
    await post(voters[0]!.cookie, `/alerts/${id}/vote`, { vote: "DISPUTE" });
    expect((await get(voters[0]!.cookie, `/alerts/${id}`)).body.data).toMatchObject({
      confirmCount: 5,
      disputeCount: 1,
    });
    expect(await prisma.alertVote.count({ where: { alertId: id } })).toBe(6);
  });

  it("only the author or staff resolves", async () => {
    const { post, get } = setup();
    const author = await member();
    const other = await member();
    const id = (await post(author.cookie, "/alerts", body)).body.data.id as string;
    expect((await post(other.cookie, `/alerts/${id}/resolve`)).status).toBe(404);
    expect((await post(author.cookie, `/alerts/${id}/resolve`)).body.data.status).toBe("RESOLVED");
    expect((await get(null, "/alerts")).body.data).toHaveLength(0);
  });
});

describe("moderation strikes", () => {
  it("each dismissal is a strike; the third pauses posting for 30 days; every action is audited", async () => {
    const { post, patch, get } = setup();
    const author = await member();
    const mod = await member(60, "MODERATOR");
    const regular = await member();
    for (let i = 0; i < 3; i++) {
      const id = (await post(author.cookie, "/alerts", { ...body, latitude: 25.1 + i * 0.05 })).body.data.id as string;
      expect(
        (await patch(regular.cookie, `/admin/alerts/${id}/status`, { status: "DISMISSED", reason: "Not real" })).status,
      ).toBe(403);
      expect(
        (await patch(mod.cookie, `/admin/alerts/${id}/status`, { status: "DISMISSED", reason: "Not a real incident" }))
          .status,
      ).toBe(200);
      const u = await prisma.user.findUniqueOrThrow({ where: { id: author.user.id } });
      expect(u.strikeCount).toBe(i + 1);
      expect(u.alertsSuspendedUntil !== null).toBe(i === 2);
    }
    expect(await prisma.moderationAction.count({ where: { action: "DISMISS" } })).toBe(3);
    expect(await prisma.moderationAction.count({ where: { action: "STRIKE" } })).toBe(3);
    expect(await prisma.moderationAction.count({ where: { action: "SUSPEND" } })).toBe(1);
    const sub = await get(author.cookie, "/me/alert-subscription");
    expect(sub.body.data.canPost).toBe(false);
    expect(sub.body.data.canPostReason).toContain("paused");
  });
});

describe("fan-out", () => {
  async function sub(lat: number, lng: number, over: object = {}) {
    const u = await member();
    await prisma.alertSubscription.create({
      data: {
        userId: u.user.id,
        enabled: true,
        centerLat: lat,
        centerLng: lng,
        radiusKm: 3,
        categories: [],
        emailEnabled: true,
        ...over,
      },
    });
    return u;
  }
  const svc = () => {
    const email = createEmailService({ prisma, publisher: inlineEmailPublisher(), env });
    return createNotificationService({ prisma, email, env });
  };

  it("notifies only matching opted-in users, skips the author, blocked and suspended, and is idempotent", async () => {
    const { post } = setup();
    const author = await member();
    const near = await sub(25.15, 75.8);
    const farAway = await sub(26.5, 75.8);
    const disabled = await sub(25.15, 75.8, { enabled: false });
    const wrongCategory = await sub(25.15, 75.8, { categories: ["FIRE"] });
    const blocked = await sub(25.15, 75.8);
    const suspended = await sub(25.15, 75.8);
    const noEmail = await sub(25.15, 75.8, { emailEnabled: false });
    const authorSub = await prisma.alertSubscription.create({
      data: { userId: author.user.id, enabled: true, centerLat: 25.15, centerLng: 75.8, radiusKm: 3, categories: [] },
    });
    void authorSub;
    await prisma.userBlock.create({ data: { blockerId: blocked.user.id, blockedId: author.user.id } });
    await prisma.user.update({ where: { id: suspended.user.id }, data: { status: "SUSPENDED" } });

    const id = (await post(author.cookie, "/alerts", body)).body.data.id as string;
    const run = () => runAlertFanout({ prisma, clock: systemClock, notifications: svc(), alertId: id });
    expect((await run()).notified).toBe(2);
    expect((await run()).notified).toBe(0); // retried job: nobody is notified twice

    const got = (await prisma.notification.findMany({ where: { type: "ALERT_NEARBY" } })).map((n) => n.userId).sort();
    expect(got).toEqual([near.user.id, noEmail.user.id].sort());
    void farAway;
    void disabled;
    void wrongCategory;
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: near.user.id } });
    expect(n.title).toContain("Unverified");
    expect(n.body).toContain("call 112");
    expect(await prisma.capturedEmail.count({ where: { subject: n.title } })).toBe(1); // noEmail user got no email
  });

  it("alert.expire moves old alerts to EXPIRED", async () => {
    const { post } = setup();
    const a = await member();
    const id = (await post(a.cookie, "/alerts", body)).body.data.id as string;
    expect(await runAlertExpire(prisma, { now: () => new Date(Date.now() + 5 * 3_600_000) })).toBe(0);
    expect(await runAlertExpire(prisma, { now: () => new Date(Date.now() + 7 * 3_600_000) })).toBe(1);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
  });
});

describe("alert subscription", () => {
  it("saves and returns my area; needs a centre when enabled", async () => {
    const { get, put } = setup();
    const u = await member();
    const body2 = {
      enabled: true,
      centerLat: 25.14,
      centerLng: 75.8,
      radiusKm: 5,
      categories: ["FIRE"],
      emailEnabled: false,
    };
    expect((await put(u.cookie, "/me/alert-subscription", { ...body2, centerLat: null })).status).toBe(400);
    expect((await put(u.cookie, "/me/alert-subscription", { ...body2, radiusKm: 11 })).status).toBe(400);
    expect((await put(u.cookie, "/me/alert-subscription", body2)).status).toBe(200);
    const got = (await get(u.cookie, "/me/alert-subscription")).body.data;
    expect(got).toMatchObject({ ...body2, canPost: true });
  });
});
