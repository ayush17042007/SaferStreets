import { describe, expect, it } from "vitest";
import {
  ALL_ENUMS,
  ERROR_STATUS,
  cursorQuerySchema,
  createReportSchema,
  createRideSchema,
  errorResponseSchema,
  phoneSchema,
} from "./index.js";

describe("enums", () => {
  it("exposes values, a key map and a zod schema", () => {
    for (const e of Object.values(ALL_ENUMS)) {
      for (const v of e.values) expect((e as Record<string, unknown>)[v]).toBe(v);
      expect(e.schema.options).toEqual([...e.values]);
    }
  });
});

describe("errors", () => {
  it("keeps the appendix-07 7.2 status codes", () => {
    expect(ERROR_STATUS).toMatchObject({
      VALIDATION_ERROR: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    });
  });

  it("requires requestId in the error shape", () => {
    expect(errorResponseSchema.safeParse({ error: { code: "INTERNAL", message: "x" } }).success).toBe(false);
  });
});

describe("pagination", () => {
  it("defaults limit to 20 and caps it at 50", () => {
    expect(cursorQuerySchema.parse({}).limit).toBe(20);
    expect(cursorQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(cursorQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });
});

describe("module schemas", () => {
  it("enforces report title 5-80 and description 10-1000", () => {
    const base = { category: "POTHOLE", latitude: 25.1, longitude: 75.8, description: "A deep pothole here" };
    expect(createReportSchema.safeParse({ ...base, title: "Hole" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...base, title: "Deep hole" }).success).toBe(true);
  });

  it("enforces ride seats 1-3 and fare 10-5000", () => {
    const place = { text: "Gate", lat: 25.1, lng: 75.8 };
    const ride = {
      source: place,
      destination: place,
      departureAt: "2026-11-25T10:00:00Z",
      seatsTotal: 4,
      estimatedTotalFare: 120,
    };
    expect(createRideSchema.safeParse(ride).success).toBe(false);
    expect(createRideSchema.safeParse({ ...ride, seatsTotal: 3, estimatedTotalFare: 9 }).success).toBe(false);
    expect(createRideSchema.safeParse({ ...ride, seatsTotal: 3 }).success).toBe(true);
  });

  it("accepts Indian mobile numbers only", () => {
    expect(phoneSchema.safeParse("9876543210").success).toBe(true);
    expect(phoneSchema.safeParse("+919876543210").success).toBe(true);
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });
});
