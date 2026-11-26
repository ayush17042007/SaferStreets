import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp, createUserWithSession, prisma, xhr } from "../helpers.js";

const FUTURE = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function setup() {
  const { app } = buildTestApp();
  const user = await createUserWithSession();
  const mod = await createUserWithSession({ role: "MODERATOR" });
  const admin = await createUserWithSession({ role: "ADMIN" });
  const target = await createUserWithSession();
  const call = (method: "get" | "post" | "patch" | "put", cookie: string | null, path: string, body?: object) => {
    let r = request(app)[method](`/api/v1${path}`);
    if (method !== "get") r = r.set(xhr);
    if (cookie) r = r.set("Cookie", cookie);
    return body ? r.send(body) : r;
  };
  return { app, user, mod, admin, target, call };
}

describe("RBAC on every admin route", () => {
  it("guests get 401, users 403, moderators only the moderator routes, admins everything", async () => {
    const { user, mod, admin, target, call } = await setup();
    const id = target.user.id;
    const routes: Array<[Parameters<typeof call>[0], string, "moderator" | "admin", object?]> = [
      ["get", "/admin/overview", "moderator"],
      ["get", "/admin/queue?tab=reports", "moderator"],
      ["get", "/admin/flags", "moderator"],
      ["patch", `/admin/flags/${id}`, "moderator", { status: "DISMISSED", note: "Not an issue" }],
      ["get", "/admin/users", "moderator"],
      ["post", `/admin/users/${id}/suspend`, "moderator", { reason: "Spam", until: FUTURE(3) }],
      ["post", `/admin/users/${id}/restore`, "moderator", { reason: "Reviewed" }],
      ["post", `/admin/users/${id}/ban`, "admin", { reason: "Abuse" }],
      ["patch", `/admin/users/${id}/role`, "admin", { role: "MODERATOR", reason: "Trusted" }],
      ["get", "/admin/audit", "admin"],
      ["get", "/admin/settings", "admin"],
      ["put", "/admin/settings/thresholds", "admin", { value: {}, reason: "Tune" }],
    ];
    for (const [method, path, level, body] of routes) {
      expect((await call(method, null, path, body)).status, `guest ${path}`).toBe(401);
      expect((await call(method, user.cookie, path, body)).status, `user ${path}`).toBe(403);
      const m = await call(method, mod.cookie, path, body);
      if (level === "admin") expect(m.status, `moderator ${path}`).toBe(403);
      else expect(m.status, `moderator ${path}`).not.toBe(403);
      const a = await call(method, admin.cookie, path, body);
      expect(a.status, `admin ${path}`).not.toBe(403);
      expect(a.status, `admin ${path}`).not.toBe(401);
    }
  });
});

describe("user moderation", () => {
  it("suspend revokes sessions, is audited, blocks login state and caps moderators at 30 days; restore reverses", async () => {
    const { app, mod, target, call } = await setup();
    expect(
      (
        await call("post", mod.cookie, `/admin/users/${target.user.id}/suspend`, {
          reason: "Harassment",
          until: FUTURE(60),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", mod.cookie, `/admin/users/${target.user.id}/suspend`, {
          reason: "Harassment",
          until: FUTURE(7),
        })
      ).status,
    ).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(u.status).toBe("SUSPENDED");
    expect(await prisma.session.count({ where: { userId: target.user.id, revokedAt: null } })).toBe(0);
    expect((await request(app).get("/api/v1/me").set("Cookie", target.cookie)).status).toBeGreaterThanOrEqual(401);
    const audit = await prisma.moderationAction.findFirstOrThrow({
      where: { action: "SUSPEND", targetId: target.user.id },
    });
    expect(audit.reason).toBe("Harassment");
    expect(audit.actorId).toBe(mod.user.id);

    expect(
      (await call("post", mod.cookie, `/admin/users/${target.user.id}/restore`, { reason: "Appeal accepted" })).status,
    ).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })).status).toBe("ACTIVE");
    expect(await prisma.moderationAction.count({ where: { action: "RESTORE" } })).toBe(1);
  });

  it("a reason is required; moderators cannot act on staff or themselves; only admins ban and change roles", async () => {
    const { mod, admin, target, call } = await setup();
    expect(
      (await call("post", mod.cookie, `/admin/users/${target.user.id}/suspend`, { until: FUTURE(3) })).status,
    ).toBe(400);
    expect(
      (await call("post", mod.cookie, `/admin/users/${admin.user.id}/suspend`, { reason: "x y z", until: FUTURE(3) }))
        .status,
    ).toBe(403);
    expect(
      (await call("post", mod.cookie, `/admin/users/${mod.user.id}/suspend`, { reason: "x y z", until: FUTURE(3) }))
        .status,
    ).toBe(403);
    expect(
      (await call("post", admin.cookie, `/admin/users/${target.user.id}/ban`, { reason: "Repeated abuse" })).status,
    ).toBe(200);
    expect((await call("post", mod.cookie, `/admin/users/${target.user.id}/restore`, { reason: "Nope" })).status).toBe(
      403,
    );
    expect(
      (await call("post", admin.cookie, `/admin/users/${target.user.id}/restore`, { reason: "Second chance" })).status,
    ).toBe(200);
    expect(
      (
        await call("patch", admin.cookie, `/admin/users/${target.user.id}/role`, {
          role: "MODERATOR",
          reason: "Trusted helper",
        })
      ).status,
    ).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })).role).toBe("MODERATOR");
    expect(
      (await call("patch", admin.cookie, `/admin/users/${admin.user.id}/role`, { role: "USER", reason: "Self demote" }))
        .status,
    ).toBe(403);
    const actions = (await prisma.moderationAction.findMany()).map((a) => a.action).sort();
    expect(actions).toEqual(["BAN", "RESTORE", "ROLE_CHANGE"]);
  });

  it("lists users with masked emails", async () => {
    const { mod, call } = await setup();
    const res = await call("get", mod.cookie, "/admin/users");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/user-[0-9a-f]{12}/);
    expect(res.body.data[0].emailMasked).toMatch(/^.\*\*\*@/);
  });
});

describe("flags, queue, overview, audit and settings", () => {
  it("resolves a flag once with a note and an audit row; the queue and counters reflect it", async () => {
    const { user, mod, admin, call } = await setup();
    const reporter = await createUserWithSession();
    const report = await prisma.report.create({
      data: {
        authorId: user.user.id,
        category: "POTHOLE",
        title: "Pothole on Ring Road",
        description: "Deep pothole near the junction",
        latitude: 25.14,
        longitude: 75.8,
        addressText: "Ring Road",
      },
    });
    expect(
      (
        await call("post", reporter.cookie, "/flags", {
          targetType: "REPORT",
          targetId: report.id,
          reason: "Looks like spam",
        })
      ).status,
    ).toBe(201);
    expect((await call("get", mod.cookie, "/admin/overview")).body.data).toMatchObject({
      reportsToReview: 1,
      openFlags: 1,
    });
    expect((await call("get", mod.cookie, "/admin/queue?tab=reports")).body.data[0]).toMatchObject({
      id: report.id,
      openFlags: 1,
    });
    const flag = (await call("get", mod.cookie, "/admin/flags")).body.data[0];
    expect((await call("patch", mod.cookie, `/admin/flags/${flag.id}`, { status: "DISMISSED" })).status).toBe(400);
    expect(
      (
        await call("patch", mod.cookie, `/admin/flags/${flag.id}`, {
          status: "DISMISSED",
          note: "Checked, genuine report",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("patch", mod.cookie, `/admin/flags/${flag.id}`, { status: "ACTIONED", note: "Again" })).status,
    ).toBe(409);
    expect((await call("get", mod.cookie, "/admin/overview")).body.data.openFlags).toBe(0);
    const log = (await call("get", admin.cookie, "/admin/audit")).body.data;
    expect(log[0]).toMatchObject({ action: "FLAG_RESOLVE", reason: "Checked, genuine report" });
  });

  it("changing a setting needs a reason, validates, writes the audit row with before and after", async () => {
    const { admin, call } = await setup();
    const current = (await call("get", admin.cookie, "/admin/settings")).body.data.thresholds;
    expect(
      (await call("put", admin.cookie, "/admin/settings/thresholds", { value: { ...current, reportConfirmations: 5 } }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("put", admin.cookie, "/admin/settings/thresholds", {
          value: { ...current, reportConfirmations: 0 },
          reason: "Test",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("put", admin.cookie, "/admin/settings/thresholds", {
          value: { ...current, reportConfirmations: 5 },
          reason: "Campus pilot tuning",
        })
      ).status,
    ).toBe(200);
    expect((await call("get", admin.cookie, "/admin/settings")).body.data.thresholds.reportConfirmations).toBe(5);
    const a = await prisma.moderationAction.findFirstOrThrow({ where: { action: "SETTINGS_CHANGE" } });
    expect(a.meta).toMatchObject({ before: { reportConfirmations: 3 }, after: { reportConfirmations: 5 } });
  });
});
