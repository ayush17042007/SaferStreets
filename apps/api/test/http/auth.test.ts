import request from "supertest";
import { describe, expect, it } from "vitest";
import { mountRoutes } from "../../src/http/routes.js";
import { readCookie } from "../../src/middleware/auth.js";
import { buildTestApp, createUserWithSession, prisma } from "../helpers.js";

const { app } = buildTestApp({
  extend: (a, registry) =>
    mountRoutes(a, registry, "/api/v1", [
      {
        method: "get",
        path: "/test/me",
        summary: "user probe",
        tags: ["test"],
        auth: "user",
        responses: { 200: { description: "ok" } },
        handlers: [(req, res) => res.json({ userId: req.auth?.userId, role: req.auth?.role })],
      },
      {
        method: "get",
        path: "/test/mod",
        summary: "moderator probe",
        tags: ["test"],
        auth: "moderator",
        responses: { 200: { description: "ok" } },
        handlers: [(_req, res) => res.json({ ok: true })],
      },
      {
        method: "get",
        path: "/test/admin",
        summary: "admin probe",
        tags: ["test"],
        auth: "admin",
        responses: { 200: { description: "ok" } },
        handlers: [(_req, res) => res.json({ ok: true })],
      },
    ]),
});

describe("requireAuth / requireRole (deny by default)", () => {
  it("rejects anonymous and unknown-token requests with 401", async () => {
    expect((await request(app).get("/api/v1/test/me")).status).toBe(401);
    expect((await request(app).get("/api/v1/test/me").set("Cookie", "ss_session=forged")).status).toBe(401);
  });

  it("accepts a valid session and exposes only the server-side identity", async () => {
    const { user, cookie } = await createUserWithSession();
    const res = await request(app).get("/api/v1/test/me?userId=someone-else").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: user.id, role: "USER" });
  });

  it("rejects revoked and expired sessions", async () => {
    const { user, cookie } = await createUserWithSession();
    await prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    expect((await request(app).get("/api/v1/test/me").set("Cookie", cookie)).status).toBe(401);

    const other = await createUserWithSession();
    await prisma.session.updateMany({
      where: { userId: other.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request(app).get("/api/v1/test/me").set("Cookie", other.cookie)).status).toBe(401);
  });

  it("rejects suspended and banned users with 403 on every request", async () => {
    const suspended = await createUserWithSession({ status: "SUSPENDED" });
    const banned = await createUserWithSession({ status: "BANNED" });
    expect((await request(app).get("/api/v1/test/me").set("Cookie", suspended.cookie)).status).toBe(403);
    expect((await request(app).get("/api/v1/test/me").set("Cookie", banned.cookie)).status).toBe(403);
  });

  it("enforces the role hierarchy with admin implied", async () => {
    const user = await createUserWithSession();
    const mod = await createUserWithSession({ role: "MODERATOR" });
    const admin = await createUserWithSession({ role: "ADMIN" });
    expect((await request(app).get("/api/v1/test/mod").set("Cookie", user.cookie)).status).toBe(403);
    expect((await request(app).get("/api/v1/test/mod").set("Cookie", mod.cookie)).status).toBe(200);
    expect((await request(app).get("/api/v1/test/mod").set("Cookie", admin.cookie)).status).toBe(200);
    expect((await request(app).get("/api/v1/test/admin").set("Cookie", mod.cookie)).status).toBe(403);
    expect((await request(app).get("/api/v1/test/admin").set("Cookie", admin.cookie)).status).toBe(200);
  });

  it("parses cookies defensively", () => {
    expect(readCookie("a=1; ss_session=abc%20d; b=2", "ss_session")).toBe("abc d");
    expect(readCookie("ss_session=%E0%A4%A", "ss_session")).toBeUndefined();
    expect(readCookie(undefined, "ss_session")).toBeUndefined();
  });
});
