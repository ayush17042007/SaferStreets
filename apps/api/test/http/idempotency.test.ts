import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mountRoutes } from "../../src/http/routes.js";
import { systemClock } from "../../src/lib/clock.js";
import { idempotency } from "../../src/middleware/idempotency.js";
import { buildTestApp, createUserWithSession, prisma, xhr } from "../helpers.js";

function build() {
  let created = 0;
  const { app } = buildTestApp({
    extend: (a, registry) =>
      mountRoutes(a, registry, "/api/v1", [
        {
          method: "post",
          path: "/test/things",
          summary: "idempotent create probe",
          tags: ["test"],
          auth: "user",
          request: {
            body: z.object({ name: z.string(), fail: z.boolean().optional(), slowMs: z.number().optional() }),
          },
          responses: { 201: { description: "created" } },
          handlers: [
            idempotency({ prisma, clock: systemClock }),
            async (req, res) => {
              if (req.body.slowMs) await new Promise((r) => setTimeout(r, req.body.slowMs));
              if (req.body.fail) return res.status(400).json({ error: "nope" });
              created += 1;
              res.status(201).json({ n: created, name: req.body.name });
            },
          ],
        },
      ]),
  });
  return { app, count: () => created };
}

describe("Idempotency-Key (Part B5)", () => {
  it("replays the original response for the same key and body", async () => {
    const { app, count } = build();
    const { cookie } = await createUserWithSession();
    const send = () =>
      request(app)
        .post("/api/v1/test/things")
        .set(xhr)
        .set("Cookie", cookie)
        .set("Idempotency-Key", "key-00000001")
        .send({ name: "a" });

    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(count()).toBe(1);
  });

  it("returns 422 when the same key is reused with a different body", async () => {
    const { app } = build();
    const { cookie } = await createUserWithSession();
    const base = () =>
      request(app).post("/api/v1/test/things").set(xhr).set("Cookie", cookie).set("Idempotency-Key", "key-00000002");
    await base().send({ name: "a" });
    const res = await base().send({ name: "b" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_MISMATCH");
  });

  it("scopes keys per user", async () => {
    const { app, count } = build();
    const a = await createUserWithSession();
    const b = await createUserWithSession();
    for (const u of [a, b]) {
      await request(app)
        .post("/api/v1/test/things")
        .set(xhr)
        .set("Cookie", u.cookie)
        .set("Idempotency-Key", "shared-key-1")
        .send({ name: "x" });
    }
    expect(count()).toBe(2);
  });

  it("does not store failed responses, so the key can be retried", async () => {
    const { app, count } = build();
    const { cookie } = await createUserWithSession();
    const r1 = await request(app)
      .post("/api/v1/test/things")
      .set(xhr)
      .set("Cookie", cookie)
      .set("Idempotency-Key", "key-00000003")
      .send({ name: "a", fail: true });
    expect(r1.status).toBe(400);
    expect(await prisma.idempotencyKey.count()).toBe(0);
    const r2 = await request(app)
      .post("/api/v1/test/things")
      .set(xhr)
      .set("Cookie", cookie)
      .set("Idempotency-Key", "key-00000004")
      .send({ name: "a" });
    expect(r2.status).toBe(201);
    expect(count()).toBe(1);
  });

  it("answers 409 while the original request is still running", async () => {
    const { app, count } = build();
    const { cookie } = await createUserWithSession();
    const req = () =>
      request(app)
        .post("/api/v1/test/things")
        .set(xhr)
        .set("Cookie", cookie)
        .set("Idempotency-Key", "key-00000005")
        .send({ name: "a", slowMs: 400 });
    const first = req().then((r) => r);
    await new Promise((r) => setTimeout(r, 150));
    const second = await req();
    expect(second.status).toBe(409);
    expect((await first).status).toBe(201);
    expect(count()).toBe(1);
  });

  it("rejects malformed keys and requires a session", async () => {
    const { app } = build();
    const { cookie } = await createUserWithSession();
    const bad = await request(app)
      .post("/api/v1/test/things")
      .set(xhr)
      .set("Cookie", cookie)
      .set("Idempotency-Key", "x")
      .send({ name: "a" });
    expect(bad.status).toBe(400);
    const anon = await request(app)
      .post("/api/v1/test/things")
      .set(xhr)
      .set("Idempotency-Key", "key-00000006")
      .send({ name: "a" });
    expect(anon.status).toBe(401);
  });
});
