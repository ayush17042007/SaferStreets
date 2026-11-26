import request from "supertest";
import { describe, expect, it } from "vitest";
import { emergencyNumbersResponseSchema } from "@saferstreets/shared";
import { buildTestApp, prisma } from "../helpers.js";

describe("GET /api/v1/public/emergency-numbers", () => {
  it("is public and returns the spec defaults 112/100/108/1091/101", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/v1/public/emergency-numbers");
    expect(res.status).toBe(200);
    const body = emergencyNumbersResponseSchema.parse(res.body);
    expect(body.data.map((n) => n.number)).toEqual(["112", "100", "108", "1091", "101"]);
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("reads configured numbers from system_settings", async () => {
    await prisma.systemSetting.create({
      data: { key: "emergencyNumbers", value: [{ key: "emergency", label: "Emergency", number: "112" }] },
    });
    const { app } = buildTestApp();
    const res = await request(app).get("/api/v1/public/emergency-numbers");
    expect(res.body.data).toEqual([{ key: "emergency", label: "Emergency", number: "112" }]);
  });

  it("is reachable through the /api prefix used by the Next rewrite", async () => {
    const { app } = buildTestApp();
    expect((await request(app).get("/api/v1/public/emergency-numbers")).status).toBe(200);
  });
});
