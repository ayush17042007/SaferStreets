import { describe, expect, it } from "vitest";
import { seedDemoData } from "../../prisma/seed.js";
import { prisma } from "../helpers.js";

describe("db:seed", () => {
  it("refuses to run when NODE_ENV is production", async () => {
    await expect(seedDemoData(prisma, { nodeEnv: "production" })).rejects.toThrow(/production/i);
  });

  it("seeds demo data idempotently in non-production", async () => {
    const first = await seedDemoData(prisma, { nodeEnv: "test" });
    expect(first).toEqual({ users: 4, reports: 3, rides: 2, alerts: 2 });

    // Second run must succeed without duplicates or constraint errors.
    const second = await seedDemoData(prisma, { nodeEnv: "test" });
    expect(second).toEqual({ users: 4, reports: 3, rides: 2, alerts: 2 });

    expect(await prisma.report.count()).toBe(3);
    expect(await prisma.ride.count()).toBe(2);
    expect(await prisma.alert.count()).toBe(2);
  });
});
