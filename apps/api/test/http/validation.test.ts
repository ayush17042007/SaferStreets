import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mountRoutes } from "../../src/http/routes.js";
import { deepTrim } from "../../src/middleware/validate.js";
import { buildTestApp, xhr } from "../helpers.js";

const { app } = buildTestApp({
  extend: (a, registry) =>
    mountRoutes(a, registry, "/api/v1", [
      {
        method: "post",
        path: "/test/items/:id",
        summary: "validation probe",
        tags: ["test"],
        auth: "public",
        request: {
          params: z.object({ id: z.uuid() }),
          query: z.object({ limit: z.coerce.number().int().max(50).default(20) }),
          body: z.object({ title: z.string().min(5).max(80), tags: z.array(z.string()).default([]) }),
        },
        responses: { 200: { description: "echo" } },
        handlers: [(req, res) => res.json({ params: req.params, query: req.query, body: req.body })],
      },
    ]),
});

const ID = "7b0c3a52-8d36-4f7e-9b0a-2f1a3c4d5e6f";

describe("validate middleware", () => {
  it("parses, coerces, trims and strips unknown fields", async () => {
    const res = await request(app)
      .post(`/api/v1/test/items/${ID}?limit=5&extra=1`)
      .set(xhr)
      .send({ title: "   Broken light   ", tags: [" a "], isAdmin: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      params: { id: ID },
      query: { limit: 5 },
      body: { title: "Broken light", tags: ["a"] },
    });
  });

  it("applies defaults", async () => {
    const res = await request(app).post(`/api/v1/test/items/${ID}`).set(xhr).send({ title: "Long enough" });
    expect(res.body.query).toEqual({ limit: 20 });
    expect(res.body.body.tags).toEqual([]);
  });

  it("reports every failing field with its path", async () => {
    const res = await request(app).post("/api/v1/test/items/not-a-uuid?limit=99").set(xhr).send({ title: "  ab  " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["body.title", "params.id", "query.limit"]);
  });

  it("trims a string that is only whitespace down to empty (then min length fails)", () => {
    expect(deepTrim({ a: "   ", b: [" x "], c: 1, d: null })).toEqual({ a: "", b: ["x"], c: 1, d: null });
  });
});
