import request from "supertest";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { meResponseSchema, publicProfileResponseSchema, TERMS_VERSION } from "@saferstreets/shared";
import { displayName, normalizePhone } from "../../src/modules/users/users.service.js";
import { buildTestApp, createUser, prisma, xhr } from "../helpers.js";
import { login, loginOnboarded } from "../authHelpers.js";

const patch = (app: Parameters<typeof request>[0], cookie: string, body: object) =>
  request(app).patch("/api/v1/me").set(xhr).set("Cookie", cookie).send(body);

describe("GET /me and PATCH /me", () => {
  it("requires a session", async () => {
    const { app } = buildTestApp();
    expect((await request(app).get("/api/v1/me")).status).toBe(401);
  });

  it("starts as needing onboarding and returns counts", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    const res = await request(app).get("/api/v1/me").set("Cookie", cookie);
    const me = meResponseSchema.parse(res.body).data;
    expect(me).toMatchObject({ email: "riya@example.test", needsOnboarding: true, role: "USER", fullName: null });
    expect(me.counts).toEqual({ reports: 0, rides: 0, contacts: 0 });
  });

  it("onboarding records the 18+/terms acceptance as consents with a version and a hashed IP", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    const res = await patch(app, cookie, {
      fullName: "  Riya Sharma  ",
      phone: "9876543210",
      acceptTerms: true,
      alertOptIn: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      fullName: "Riya Sharma",
      phone: "+919876543210",
      needsOnboarding: false,
      alertOptIn: true,
    });

    const user = await prisma.user.findFirstOrThrow();
    expect(user.termsAcceptedAt).not.toBeNull();
    const consents = await prisma.consent.findMany({ orderBy: { type: "asc" } });
    expect(consents.map((c) => c.type)).toEqual(["TERMS", "PRIVACY", "ALERT_OPTIN"]); // enum order
    for (const c of consents) {
      expect(c.version).toBe(TERMS_VERSION);
      expect(c.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(c.userId).toBe(user.id);
    }
    // The raw IP is never stored.
    expect(consents.map((c) => c.ipHash)).not.toContain("::ffff:127.0.0.1");
    const loopback = ["::ffff:127.0.0.1", "127.0.0.1", "::1"].map((ip) =>
      createHash("sha256").update(ip).digest("hex"),
    );
    expect(loopback).toContain(consents[0]!.ipHash);
  });

  it("accepting terms twice does not duplicate consent records", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test");
    await patch(app, cookie, { acceptTerms: true });
    await patch(app, cookie, { acceptTerms: true });
    expect(await prisma.consent.count({ where: { type: "TERMS" } })).toBe(1);
  });

  it("requires the 18+ and terms checkbox to be true", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    const res = await patch(app, cookie, { fullName: "Riya Sharma", acceptTerms: false });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("body.acceptTerms");
    expect((await prisma.user.findFirstOrThrow()).termsAcceptedAt).toBeNull();
  });

  it("validates name length 2-60 and Indian mobile format", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    expect((await patch(app, cookie, { fullName: "R" })).status).toBe(400);
    expect((await patch(app, cookie, { fullName: "x".repeat(61) })).status).toBe(400);
    expect((await patch(app, cookie, { phone: "12345" })).status).toBe(400);
    expect((await patch(app, cookie, { phone: "5876543210" })).status).toBe(400);
    expect((await patch(app, cookie, {})).status).toBe(400);
    expect((await patch(app, cookie, { phone: "+919876543210" })).body.data.phone).toBe("+919876543210");
    expect((await patch(app, cookie, { phone: null })).body.data.phone).toBeNull();
  });

  it("cannot change role, status or email through PATCH /me (unknown fields are stripped)", async () => {
    const { app } = buildTestApp();
    const cookie = await login(app, "riya@example.test");
    const res = await patch(app, cookie, {
      fullName: "Riya Sharma",
      role: "ADMIN",
      status: "BANNED",
      email: "evil@example.test",
      userId: "x",
    });
    expect(res.status).toBe(200);
    const user = await prisma.user.findFirstOrThrow();
    expect(user).toMatchObject({ role: "USER", status: "ACTIVE", email: "riya@example.test" });
  });

  it("never returns other users' data", async () => {
    const { app } = buildTestApp();
    await createUser({ email: "other@example.test" });
    const cookie = await login(app, "riya@example.test");
    const res = await request(app).get("/api/v1/me").set("Cookie", cookie);
    expect(JSON.stringify(res.body)).not.toContain("other@example.test");
  });
});

describe("DELETE /me", () => {
  it("soft deletes, revokes every session and blocks future logins", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test");
    const res = await request(app).delete("/api/v1/me").set(xhr).set("Cookie", cookie);
    expect(res.status).toBe(200);
    const user = await prisma.user.findFirstOrThrow();
    expect(user.status).toBe("DELETED");
    expect(user.deletedAt).not.toBeNull();
    expect(user.email).toBe("riya@example.test"); // PII scrub is the cleanup job (Prompt 12/14)
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).status).toBe(401);
    await expect(login(app, "riya@example.test")).rejects.toThrow(/verify failed/);
  });
});

describe("GET /users/:id/public", () => {
  it("returns only display name, avatar and joined date", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test", "Riya Sharma");
    await patch(app, cookie, { phone: "9876543210" });
    const target = await prisma.user.findFirstOrThrow();
    const viewer = await loginOnboarded(app, "arjun@example.test", "Arjun K");
    const res = await request(app).get(`/api/v1/users/${target.id}/public`).set("Cookie", viewer);
    expect(res.status).toBe(200);
    const data = publicProfileResponseSchema.parse(res.body).data;
    expect(data.displayName).toBe("Riya S.");
    expect(Object.keys(data).sort()).toEqual(["avatarUrl", "displayName", "id", "joinedAt"]);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("riya@example.test");
    expect(text).not.toContain("9876543210");
  });

  it("404s unknown, deleted and suspended users, and needs a session", async () => {
    const { app } = buildTestApp();
    const viewer = await loginOnboarded(app, "arjun@example.test");
    const gone = await createUser({ email: "gone@example.test", status: "SUSPENDED" });
    expect((await request(app).get(`/api/v1/users/${gone.id}/public`).set("Cookie", viewer)).status).toBe(404);
    expect(
      (await request(app).get("/api/v1/users/7b0c3a52-8d36-4f7e-9b0a-2f1a3c4d5e6f/public").set("Cookie", viewer))
        .status,
    ).toBe(404);
    expect((await request(app).get(`/api/v1/users/${gone.id}/public`)).status).toBe(401);
  });
});

describe("helpers", () => {
  it("normalises phones and display names", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(displayName("Riya Sharma")).toBe("Riya S.");
    expect(displayName("Riya")).toBe("Riya");
    expect(displayName("Riya Kumar Sharma")).toBe("Riya S.");
    expect(displayName(null)).toBe("SaferStreets member");
  });
});
