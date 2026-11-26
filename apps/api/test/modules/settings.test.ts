import { describe, expect, it } from "vitest";
import { fixedClock } from "../../src/lib/clock.js";
import { SETTINGS } from "../../src/modules/settings/settings.schema.js";
import { createSettingsRepository } from "../../src/modules/settings/settings.repository.js";
import { SETTINGS_CACHE_TTL_MS, createSettingsService } from "../../src/modules/settings/settings.service.js";
import { createUser, prisma, silentLogger } from "../helpers.js";

function service(clock = fixedClock("2026-11-25T10:00:00Z")) {
  return { clock, svc: createSettingsService({ repo: createSettingsRepository(prisma), clock, log: silentLogger }) };
}

describe("system_settings service", () => {
  it("returns spec defaults when nothing is stored", async () => {
    const { svc } = service();
    expect(await svc.get("thresholds")).toEqual(SETTINGS.thresholds.default);
    const numbers = await svc.get("emergencyNumbers");
    expect(numbers.map((n) => n.number)).toEqual(["112", "100", "108", "1091", "101"]);
    expect(await svc.get("serviceRegion")).toEqual(SETTINGS.serviceRegion.default);
  });

  it("stores validated values, records who changed them, and invalidates the cache", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const { svc } = service();
    await svc.get("thresholds");
    await svc.set("thresholds", { ...SETTINGS.thresholds.default, reportConfirmations: 5 }, admin.id);
    expect((await svc.get("thresholds")).reportConfirmations).toBe(5);
    const row = await prisma.systemSetting.findUnique({ where: { key: "thresholds" } });
    expect(row?.updatedBy).toBe(admin.id);
  });

  it("rejects invalid values on write", async () => {
    const { svc } = service();
    await expect(svc.set("serviceRegion", { minLat: 30, maxLat: 20, minLng: 70, maxLng: 80 }, null)).rejects.toThrow();
  });

  it("ignores an invalid stored row and falls back to the default", async () => {
    await prisma.systemSetting.create({ data: { key: "thresholds", value: { reportConfirmations: "lots" } } });
    const { svc } = service();
    expect(await svc.get("thresholds")).toEqual(SETTINGS.thresholds.default);
  });

  it("caches for the TTL, then reloads", async () => {
    const { svc, clock } = service();
    expect((await svc.get("thresholds")).alertExpiryHours).toBe(6);
    await prisma.systemSetting.create({
      data: { key: "thresholds", value: { ...SETTINGS.thresholds.default, alertExpiryHours: 8 } },
    });
    expect((await svc.get("thresholds")).alertExpiryHours).toBe(6);
    clock.advance(SETTINGS_CACHE_TTL_MS + 1);
    expect((await svc.get("thresholds")).alertExpiryHours).toBe(8);
  });
});
