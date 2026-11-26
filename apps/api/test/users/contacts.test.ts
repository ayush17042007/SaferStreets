import request from "supertest";
import { describe, expect, it } from "vitest";
import { emergencyContactListSchema } from "@saferstreets/shared";
import { buildTestApp, prisma, xhr } from "../helpers.js";
import { loginOnboarded } from "../authHelpers.js";

const valid = {
  name: "Mom",
  relationship: "Mother",
  email: "mom@example.test",
  phone: "9876543210",
  consentConfirmed: true,
};

async function setup() {
  const { app } = buildTestApp();
  const cookie = await loginOnboarded(app, "riya@example.test");
  const add = (body: object, c = cookie) =>
    request(app).post("/api/v1/me/contacts").set(xhr).set("Cookie", c).send(body);
  return { app, cookie, add };
}

describe("emergency contacts", () => {
  it("creates, lists, edits and deletes a contact", async () => {
    const { app, cookie, add } = await setup();
    const created = await add(valid);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: "Mom",
      email: "mom@example.test",
      phone: "+919876543210",
      unsubscribed: false,
    });

    const list = await request(app).get("/api/v1/me/contacts").set("Cookie", cookie);
    expect(emergencyContactListSchema.parse(list.body).data).toHaveLength(1);

    const id = created.body.data.id as string;
    const edited = await request(app)
      .patch(`/api/v1/me/contacts/${id}`)
      .set(xhr)
      .set("Cookie", cookie)
      .send({ name: "Mother" });
    expect(edited.body.data.name).toBe("Mother");

    expect((await request(app).delete(`/api/v1/me/contacts/${id}`).set(xhr).set("Cookie", cookie)).status).toBe(200);
    expect(await prisma.emergencyContact.count()).toBe(0);
    expect((await request(app).delete(`/api/v1/me/contacts/${id}`).set(xhr).set("Cookie", cookie)).status).toBe(404);
  });

  it("requires the consent checkbox and an email", async () => {
    const { add } = await setup();
    const noConsent = await add({ ...valid, consentConfirmed: false });
    expect(noConsent.status).toBe(400);
    expect(noConsent.body.error.details[0].field).toBe("body.consentConfirmed");
    expect((await add({ name: "Mom", consentConfirmed: true })).status).toBe(400);
    expect((await add({ ...valid, email: "nope" })).status).toBe(400);
    expect((await add({ ...valid, phone: "123" })).status).toBe(400);
    expect(await prisma.emergencyContact.count()).toBe(0);
  });

  it("rejects the user's own email in any case", async () => {
    const { add } = await setup();
    for (const email of ["riya@example.test", "RIYA@Example.Test"]) {
      const res = await add({ ...valid, email });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe("email");
    }
  });

  it("keeps contacts unique per user (case-insensitive)", async () => {
    const { add } = await setup();
    expect((await add(valid)).status).toBe(201);
    const dup = await add({ ...valid, email: "MOM@example.test" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe("You've already added this person.");
  });

  it("allows at most 5 contacts", async () => {
    const { add } = await setup();
    for (let i = 0; i < 5; i++) expect((await add({ ...valid, email: `c${i}@example.test` })).status).toBe(201);
    const sixth = await add({ ...valid, email: "c5@example.test" });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("CONFLICT");
    expect(await prisma.emergencyContact.count()).toBe(5);
  });

  it("cannot exceed 5 even with parallel requests", async () => {
    const { add } = await setup();
    const results = await Promise.all(
      Array.from({ length: 9 }, (_, i) => add({ ...valid, email: `p${i}@example.test` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(await prisma.emergencyContact.count()).toBe(5);
  });

  it("IDOR: another user's contact cannot be read, edited or deleted", async () => {
    const { app, add } = await setup();
    const created = await add(valid);
    const id = created.body.data.id as string;
    const intruder = await loginOnboarded(app, "arjun@example.test", "Arjun K");

    const list = await request(app).get("/api/v1/me/contacts").set("Cookie", intruder);
    expect(list.body.data).toEqual([]);
    expect(
      (await request(app).patch(`/api/v1/me/contacts/${id}`).set(xhr).set("Cookie", intruder).send({ name: "Hacked" }))
        .status,
    ).toBe(404);
    expect((await request(app).delete(`/api/v1/me/contacts/${id}`).set(xhr).set("Cookie", intruder)).status).toBe(404);
    expect((await prisma.emergencyContact.findUniqueOrThrow({ where: { id } })).name).toBe("Mom");
  });

  it("needs a session and never leaks contact details in the profile of others", async () => {
    const { app, add } = await setup();
    await add(valid);
    expect((await request(app).get("/api/v1/me/contacts")).status).toBe(401);
    const other = await loginOnboarded(app, "arjun@example.test", "Arjun K");
    const me = await request(app).get("/api/v1/me").set("Cookie", other);
    expect(JSON.stringify(me.body)).not.toContain("mom@example.test");
  });

  it("rejects editing a contact to the user's own email or to a duplicate", async () => {
    const { app, cookie, add } = await setup();
    const a = await add(valid);
    await add({ ...valid, email: "dad@example.test", name: "Dad" });
    const own = await request(app)
      .patch(`/api/v1/me/contacts/${a.body.data.id}`)
      .set(xhr)
      .set("Cookie", cookie)
      .send({ email: "riya@example.test" });
    expect(own.status).toBe(400);
    const dup = await request(app)
      .patch(`/api/v1/me/contacts/${a.body.data.id}`)
      .set(xhr)
      .set("Cookie", cookie)
      .send({ email: "dad@example.test" });
    expect(dup.status).toBe(409);
  });
});
