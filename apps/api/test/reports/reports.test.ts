import request from "supertest";
import { describe, expect, it } from "vitest";
import { REPORT_TRANSITIONS } from "../../src/modules/reports/reports.service.js";
import { buildTestApp, createUserWithSession, prisma, xhr } from "../helpers.js";
import { loginOnboarded } from "../authHelpers.js";

const body = {
  category: "BROKEN_STREETLIGHT",
  title: "Streetlight out near hostel gate",
  description: "Three consecutive lights are off and the road is very dark.",
  latitude: 25.1425,
  longitude: 75.834,
  addressText: "Main Road, near Gate 2",
};

type App = Parameters<typeof request>[0];
const post = (app: App, cookie: string, path: string, data: object = {}) =>
  request(app).post(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(data);
const patch = (app: App, cookie: string, path: string, data: object) =>
  request(app).patch(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(data);

async function setup() {
  const { app } = buildTestApp();
  const author = await loginOnboarded(app, "riya@example.test", "Riya Sharma");
  const other = await loginOnboarded(app, "arjun@example.test", "Arjun Kumar");
  const mod = (await createUserWithSession({ role: "MODERATOR" })).cookie;
  const created = await post(app, author, "/reports", body);
  return { app, author, other, mod, id: created.body.data.id as string, created };
}

describe("POST /reports", () => {
  it("files a report with status SUBMITTED, a history entry and no author in the response", async () => {
    const { created } = await setup();
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      status: "SUBMITTED",
      confirmationCount: 0,
      isMine: true,
      canEdit: true,
      version: 0,
    });
    expect(created.body.data.history).toHaveLength(1);
    expect(created.body.data.author).toBeUndefined();
  });

  it("validates title, description and coordinates, and refuses pins outside the service area", async () => {
    const { app, author } = await setup();
    expect((await post(app, author, "/reports", { ...body, title: "Hole" })).status).toBe(400);
    expect((await post(app, author, "/reports", { ...body, description: "short" })).status).toBe(400);
    const out = await post(app, author, "/reports", { ...body, latitude: 28.61, longitude: 77.2 });
    expect(out.status).toBe(400);
    expect(out.body.error.details[0].message).toContain("outside the service area");
  });

  it("allows 5 reports per day, then 429", async () => {
    const { app, author } = await setup(); // 1 created in setup
    for (let i = 0; i < 4; i++)
      expect((await post(app, author, "/reports", { ...body, title: `Report number ${i}` })).status).toBe(201);
    const sixth = await post(app, author, "/reports", body);
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("is idempotent with an Idempotency-Key", async () => {
    const { app, author } = await setup();
    const send = () =>
      request(app)
        .post("/api/v1/reports")
        .set(xhr)
        .set("Cookie", author)
        .set("Idempotency-Key", "report-key-0001")
        .send({ ...body, title: "Only once please" });
    const a = await send();
    const b = await send();
    expect(b.body).toEqual(a.body);
    expect(await prisma.report.count({ where: { title: "Only once please" } })).toBe(1);
  });

  it("requires a session", async () => {
    const { app } = await setup();
    expect((await request(app).post("/api/v1/reports").set(xhr).send(body)).status).toBe(401);
  });
});

describe("guest and viewer projections", () => {
  it("guests see the public view: no author, no confirmed-by-me, can't confirm or edit", async () => {
    const { app, id } = await setup();
    const res = await request(app).get(`/api/v1/reports/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.author).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("riya@example.test");
    expect(res.body.data).toMatchObject({ isMine: false, canEdit: false, canConfirm: false, confirmedByMe: false });
    expect(res.body.data.history[0].by).toBeUndefined();
  });

  it("moderators see who filed it; ordinary users never do", async () => {
    const { app, other, mod, id } = await setup();
    expect((await request(app).get(`/api/v1/reports/${id}`).set("Cookie", other)).body.data.author).toBeUndefined();
    const m = await request(app).get(`/api/v1/reports/${id}`).set("Cookie", mod);
    expect(m.body.data.author.name).toBe("Riya Sharma");
  });

  it("rejected reports are hidden from the public and other users, but visible to the author and staff", async () => {
    const { app, author, other, mod, id } = await setup();
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" });
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "REJECTED", note: "Duplicate of another report" });
    expect((await request(app).get(`/api/v1/reports/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/reports/${id}`).set("Cookie", other)).status).toBe(404);
    expect((await request(app).get(`/api/v1/reports/${id}`).set("Cookie", author)).status).toBe(200);
    expect((await request(app).get(`/api/v1/reports/${id}`).set("Cookie", mod)).status).toBe(200);
    const list = await request(app).get("/api/v1/reports");
    expect(list.body.data).toHaveLength(0);
  });

  it("the rejection reason is shown to the author and staff, not to the public", async () => {
    const { app, author, other, mod, id } = await setup();
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" });
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "VERIFIED", note: "Checked on site" });
    const mine = await request(app).get(`/api/v1/reports/${id}`).set("Cookie", author);
    expect(mine.body.data.history[0].note).toBe("Checked on site");
    const theirs = await request(app).get(`/api/v1/reports/${id}`).set("Cookie", other);
    expect(theirs.body.data.history[0].note).toBeNull();
  });
});

describe("GET /reports", () => {
  it("lists with cursor pagination, newest first, without gaps or repeats", async () => {
    const { app, author } = await setup();
    for (let i = 0; i < 3; i++) await post(app, author, "/reports", { ...body, title: `Extra report ${i}` });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await request(app)
        .get("/api/v1/reports")
        .query({ limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...res.body.data.map((r: { id: string }) => r.id));
      cursor = res.body.meta.nextCursor ?? undefined;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
  });

  it("filters by category, status, distance and mine", async () => {
    const { app, author, other } = await setup();
    await post(app, other, "/reports", {
      ...body,
      category: "POTHOLE",
      title: "Deep pothole on Ring Rd",
      latitude: 25.3,
      longitude: 75.9,
    });
    const byCat = await request(app).get("/api/v1/reports").query({ category: "POTHOLE" });
    expect(byCat.body.data.map((r: { title: string }) => r.title)).toEqual(["Deep pothole on Ring Rd"]);
    const near = await request(app).get("/api/v1/reports").query({ lat: 25.1425, lng: 75.834, radius: 2 });
    expect(near.body.data).toHaveLength(1);
    expect(near.body.data[0].distanceKm).toBeLessThanOrEqual(2);
    const mine = await request(app).get("/api/v1/reports").query({ mine: "true" }).set("Cookie", author);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].isMine).toBe(true);
    expect((await request(app).get("/api/v1/reports").query({ mine: "true" })).status).toBe(401);
    expect((await request(app).get("/api/v1/reports").query({ status: "RESOLVED" })).body.data).toHaveLength(0);
  });
});

describe("owner-only edit and delete while SUBMITTED", () => {
  it("the owner edits with the version token; a stale version is refused", async () => {
    const { app, author, id } = await setup();
    const ok = await patch(app, author, `/reports/${id}`, { version: 0, title: "Streetlight fully out" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ title: "Streetlight fully out", version: 1 });
    const stale = await patch(app, author, `/reports/${id}`, { version: 0, title: "Another change" });
    expect(stale.status).toBe(409);
  });

  it("someone else cannot edit or delete it (404, like it does not exist)", async () => {
    const { app, other, mod, id } = await setup();
    expect((await patch(app, other, `/reports/${id}`, { version: 0, title: "Hijacked title" })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/reports/${id}`).set(xhr).set("Cookie", other)).status).toBe(404);
    expect((await patch(app, mod, `/reports/${id}`, { version: 0, title: "Moderator edit" })).status).toBe(404);
    expect((await prisma.report.findUniqueOrThrow({ where: { id } })).title).toBe(body.title);
  });

  it("once a moderator opens it, the owner can no longer edit or delete", async () => {
    const { app, author, mod, id } = await setup();
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" });
    expect((await patch(app, author, `/reports/${id}`, { version: 1, title: "Too late now" })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/reports/${id}`).set(xhr).set("Cookie", author)).status).toBe(409);
  });

  it("the owner can delete while SUBMITTED; it disappears for everyone", async () => {
    const { app, author, id } = await setup();
    expect((await request(app).delete(`/api/v1/reports/${id}`).set(xhr).set("Cookie", author)).status).toBe(200);
    expect((await request(app).get(`/api/v1/reports/${id}`).set("Cookie", author)).status).toBe(404);
  });
});

describe("confirmations", () => {
  it("one confirmation per user; own reports cannot be confirmed; guests cannot confirm", async () => {
    const { app, author, other, id } = await setup();
    expect((await post(app, other, `/reports/${id}/confirm`)).body.data).toMatchObject({
      confirmationCount: 1,
      confirmedByMe: true,
    });
    const again = await post(app, other, `/reports/${id}/confirm`);
    expect(again.status).toBe(409);
    expect((await post(app, author, `/reports/${id}/confirm`)).status).toBe(403);
    expect((await request(app).post(`/api/v1/reports/${id}/confirm`).set(xhr)).status).toBe(401);
    expect(await prisma.reportConfirmation.count()).toBe(1);
  });

  it("parallel confirms from one user count once", async () => {
    const { app, other, id } = await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(app, other, `/reports/${id}/confirm`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await prisma.report.findUniqueOrThrow({ where: { id } })).confirmationCount).toBe(1);
  });

  it("can be withdrawn", async () => {
    const { app, other, id } = await setup();
    await post(app, other, `/reports/${id}/confirm`);
    const del = await request(app).delete(`/api/v1/reports/${id}/confirm`).set(xhr).set("Cookie", other);
    expect(del.body.data).toMatchObject({ confirmationCount: 0, confirmedByMe: false });
    expect((await request(app).delete(`/api/v1/reports/${id}/confirm`).set(xhr).set("Cookie", other)).status).toBe(404);
  });

  it("reaching 3 marks it community-confirmed and tells the author, but never auto-verifies", async () => {
    const { app, author, id } = await setup();
    for (const e of ["a@example.test", "b@example.test", "c@example.test"]) {
      const c = await loginOnboarded(app, e, "Neighbour Person");
      await post(app, c, `/reports/${id}/confirm`);
    }
    const detail = await request(app).get(`/api/v1/reports/${id}`);
    expect(detail.body.data).toMatchObject({ confirmationCount: 3, communityConfirmed: true, status: "SUBMITTED" });
    const note = await request(app).get("/api/v1/notifications").set("Cookie", author);
    expect(note.body.data.map((n: { type: string }) => n.type)).toContain("REPORT_CONFIRMED");
  });
});

describe("status transition matrix (appendix-02 2A)", () => {
  const ALL = ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
  const needsNote = new Set(["REJECTED"]);

  it("documents exactly the allowed edges", () => {
    expect(REPORT_TRANSITIONS).toEqual({
      SUBMITTED: ["UNDER_REVIEW"],
      UNDER_REVIEW: ["VERIFIED", "REJECTED"],
      VERIFIED: ["IN_PROGRESS", "RESOLVED"],
      IN_PROGRESS: ["RESOLVED"],
      RESOLVED: ["VERIFIED"],
      REJECTED: [],
    });
  });

  for (const from of ALL) {
    for (const to of ALL) {
      const allowed = (REPORT_TRANSITIONS[from] as readonly string[]).includes(to);
      it(`${from} -> ${to} is ${allowed ? "allowed" : "refused (409)"}`, async () => {
        const { app, mod, id } = await setup();
        await prisma.report.update({ where: { id }, data: { status: from } });
        const res = await patch(app, mod, `/admin/reports/${id}/status`, {
          status: to,
          ...(needsNote.has(to) ? { note: "Reason given" } : {}),
        });
        expect(res.status).toBe(allowed ? 200 : 409);
        expect((await prisma.report.findUniqueOrThrow({ where: { id } })).status).toBe(allowed ? to : from);
      });
    }
  }

  it("rejecting needs a reason (400), and nothing changes", async () => {
    const { app, mod, id } = await setup();
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" });
    const res = await patch(app, mod, `/admin/reports/${id}/status`, { status: "REJECTED" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("body.note");
    expect((await prisma.report.findUniqueOrThrow({ where: { id } })).status).toBe("UNDER_REVIEW");
  });

  it("only moderators and admins can change status", async () => {
    const { app, author, other, id } = await setup();
    for (const c of [author, other])
      expect((await patch(app, c, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" })).status).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/admin/reports/${id}/status`).set(xhr).send({ status: "UNDER_REVIEW" })).status,
    ).toBe(401);
  });

  it("writes history, an audit row and a notification (in-app and email) in one go", async () => {
    const { app, author, mod, id } = await setup();
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" });
    await patch(app, mod, `/admin/reports/${id}/status`, { status: "VERIFIED", note: "Confirmed on site" });
    const hist = await prisma.reportStatusHistory.findMany({ where: { reportId: id }, orderBy: { createdAt: "asc" } });
    expect(hist.map((h) => h.toStatus)).toEqual(["SUBMITTED", "UNDER_REVIEW", "VERIFIED"]);
    const audit = await prisma.moderationAction.findMany({ orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["STATUS_CHANGE", "VERIFY"]);
    expect(audit[1]).toMatchObject({ targetType: "REPORT", targetId: id, reason: "Confirmed on site" });
    const list = await request(app).get("/api/v1/notifications").set("Cookie", author);
    expect(list.body.data[0]).toMatchObject({
      type: "REPORT_STATUS",
      title: "Your report was verified",
      link: `/saferoute/${id}`,
    });
    expect(await prisma.capturedEmail.count({ where: { subject: "Your report was verified" } })).toBe(1);
  });

  it("a resolved report can be reopened, clearing resolved_at", async () => {
    const { app, mod, id } = await setup();
    await prisma.report.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    const res = await patch(app, mod, `/admin/reports/${id}/status`, {
      status: "VERIFIED",
      note: "New photos show it is broken again",
    });
    expect(res.status).toBe(200);
    expect((await prisma.report.findUniqueOrThrow({ where: { id } })).resolvedAt).toBeNull();
  });

  it("two moderators racing the same change: exactly one wins", async () => {
    const { app, mod, id } = await setup();
    const mod2 = (await createUserWithSession({ role: "MODERATOR" })).cookie;
    const results = await Promise.all([
      patch(app, mod, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" }),
      patch(app, mod2, `/admin/reports/${id}/status`, { status: "UNDER_REVIEW" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.reportStatusHistory.count({ where: { reportId: id, toStatus: "UNDER_REVIEW" } })).toBe(1);
  });
});

describe("nearby duplicates and flags", () => {
  it("finds a similar open report within 100 m and ignores other categories and far ones", async () => {
    const { app, other } = await setup();
    const near = await request(app)
      .get("/api/v1/reports/nearby-duplicates")
      .query({ lat: 25.14255, lng: 75.83405, category: "BROKEN_STREETLIGHT" })
      .set("Cookie", other);
    expect(near.body.data).toHaveLength(1);
    expect(near.body.data[0]).toMatchObject({ category: "BROKEN_STREETLIGHT", confirmationCount: 0 });
    expect(near.body.data[0].distanceM).toBeLessThanOrEqual(100);
    const otherCat = await request(app)
      .get("/api/v1/reports/nearby-duplicates")
      .query({ lat: 25.1425, lng: 75.834, category: "POTHOLE" })
      .set("Cookie", other);
    expect(otherCat.body.data).toHaveLength(0);
    const far = await request(app)
      .get("/api/v1/reports/nearby-duplicates")
      .query({ lat: 25.16, lng: 75.86, category: "BROKEN_STREETLIGHT" })
      .set("Cookie", other);
    expect(far.body.data).toHaveLength(0);
  });

  it("flags a report once per user and rejects unknown targets", async () => {
    const { app, other, id } = await setup();
    const flag = { targetType: "REPORT", targetId: id, reason: "This looks like spam" };
    expect((await post(app, other, "/flags", flag)).status).toBe(201);
    expect((await post(app, other, "/flags", flag)).status).toBe(409);
    expect(
      (await post(app, other, "/flags", { ...flag, targetId: "7b0c3a52-8d36-4f7e-9b0a-2f1a3c4d5e6f" })).status,
    ).toBe(404);
    expect((await post(app, other, "/flags", { ...flag, reason: "no" })).status).toBe(400);
    expect(await prisma.flag.count()).toBe(1);
  });
});
