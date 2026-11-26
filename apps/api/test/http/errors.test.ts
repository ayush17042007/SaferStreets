import { errorResponseSchema } from "@saferstreets/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/lib/errors.js";
import { buildTestApp, prisma, xhr } from "../helpers.js";

function appWithThrowers() {
  return buildTestApp({
    extend: (app) => {
      app.get("/api/v1/test/boom", () => {
        throw new Error("secret internal detail");
      });
      app.get("/api/v1/test/app-error", () => {
        throw new AppError("FORBIDDEN", "Not yours.");
      });
      app.post("/api/v1/test/duplicate", async (_req, res) => {
        await prisma.heartbeat.create({ data: { name: "dup", lastSeenAt: new Date() } });
        await prisma.heartbeat.create({ data: { name: "dup", lastSeenAt: new Date() } });
        res.json({});
      });
      app.post("/api/v1/test/missing", async (_req, res) => {
        await prisma.heartbeat.update({ where: { name: "nope" }, data: { lastSeenAt: new Date() } });
        res.json({});
      });
      app.post("/api/v1/test/echo", (req, res) => {
        res.json({ body: req.body });
      });
    },
  });
}

describe("error model (appendix-07 7.2 + requestId)", () => {
  const { app } = appWithThrowers();

  it("404s unknown routes with the error shape and the request id", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("keeps a well-formed incoming X-Request-Id and replaces a malformed one", async () => {
    const kept = await request(app).get("/api/v1/nope").set("X-Request-Id", "abc12345-trace");
    expect(kept.body.error.requestId).toBe("abc12345-trace");
    const replaced = await request(app).get("/api/v1/nope").set("X-Request-Id", "<script>");
    expect(replaced.body.error.requestId).not.toBe("<script>");
  });

  it("hides internal errors behind a generic 500", async () => {
    const res = await request(app).get("/api/v1/test/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });

  it("passes AppError code, status and message through", async () => {
    const res = await request(app).get("/api/v1/test/app-error");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: "FORBIDDEN", message: "Not yours." });
  });

  it("maps Prisma P2002 to 409 and P2025 to 404", async () => {
    const dup = await request(app).post("/api/v1/test/duplicate").set(xhr);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");
    const missing = await request(app).post("/api/v1/test/missing").set(xhr);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON with 400 and oversized bodies with 413", async () => {
    const bad = await request(app)
      .post("/api/v1/test/echo")
      .set(xhr)
      .set("Content-Type", "application/json")
      .send('{"a":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    const big = await request(app)
      .post("/api/v1/test/echo")
      .set(xhr)
      .send({ blob: "x".repeat(200 * 1024) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("answers 503 when a handler exceeds the request timeout", async () => {
    const { app: slow } = buildTestApp({
      env: { REQUEST_TIMEOUT_MS: 1000 },
      extend: (a) => {
        a.get("/api/v1/test/slow", async (_req, res) => {
          await new Promise((r) => setTimeout(r, 1500));
          if (!res.headersSent) res.json({ late: true });
        });
      },
    });
    const res = await request(slow).get("/api/v1/test/slow");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("CSRF guard (Part B2)", () => {
  const { app } = appWithThrowers();

  it("requires X-Requested-With on state-changing requests", async () => {
    const res = await request(app).post("/api/v1/test/echo").send({ a: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a foreign Origin and accepts our own", async () => {
    const foreign = await request(app)
      .post("/api/v1/test/echo")
      .set(xhr)
      .set("Origin", "https://evil.example")
      .send({});
    expect(foreign.status).toBe(403);
    const ours = await request(app).post("/api/v1/test/echo").set(xhr).set("Origin", "http://localhost:3000").send({});
    expect(ours.status).toBe(200);
  });

  it("sets security headers and hides X-Powered-By", async () => {
    const res = await request(app).get("/health/live");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});
