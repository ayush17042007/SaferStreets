import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGION,
  bboxAround,
  formatDistance,
  haversineKm,
  haversineMeters,
  inBBox,
  inRegion,
  roundToMeters,
} from "./geo.js";

const gate = { lat: 25.1425, lng: 75.834 };

describe("haversine", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(gate, gate)).toBe(0);
    const station = { lat: 25.15, lng: 75.84 };
    expect(haversineKm(gate, station)).toBeCloseTo(haversineKm(station, gate), 9);
  });

  it("matches known distances", () => {
    // Delhi to Mumbai is about 1148 km by great circle.
    expect(haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 })).toBeGreaterThan(1140);
    expect(haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 })).toBeLessThan(1156);
    // 0.001 degrees of latitude is about 111 m.
    expect(haversineMeters({ lat: 25, lng: 75 }, { lat: 25.001, lng: 75 })).toBeCloseTo(111.2, 0);
  });
});

describe("bboxAround", () => {
  it("contains every point within the radius and is prefilter-tight", () => {
    const box = bboxAround(gate, 3);
    for (const [dLat, dLng] of [
      [0.02, 0],
      [0, 0.02],
      [-0.02, -0.02],
    ] as const) {
      const p = { lat: gate.lat + dLat, lng: gate.lng + dLng };
      if (haversineKm(gate, p) <= 3) expect(inBBox(p, box)).toBe(true);
    }
    expect(inBBox({ lat: gate.lat + 0.05, lng: gate.lng }, box)).toBe(false);
    expect(inBBox({ lat: gate.lat, lng: gate.lng + 0.05 }, box)).toBe(false);
  });

  it("widens the longitude span away from the equator", () => {
    const eq = bboxAround({ lat: 0, lng: 0 }, 5);
    const north = bboxAround({ lat: 60, lng: 0 }, 5);
    expect(north.maxLng - north.minLng).toBeGreaterThan((eq.maxLng - eq.minLng) * 1.9);
  });
});

describe("inRegion", () => {
  it("accepts points inside the default region and rejects points outside", () => {
    expect(inRegion(gate, DEFAULT_REGION)).toBe(true);
    expect(inRegion({ lat: 24.9, lng: 75.6 }, DEFAULT_REGION)).toBe(true); // bounds inclusive
    expect(inRegion({ lat: 28.6139, lng: 77.209 }, DEFAULT_REGION)).toBe(false);
    expect(inRegion({ lat: 25.1, lng: 76.2 }, DEFAULT_REGION)).toBe(false);
    expect(inRegion({ lat: 24.89, lng: 75.8 }, DEFAULT_REGION)).toBe(false);
  });
});

describe("roundToMeters (guest coordinates, ~500 m)", () => {
  it("moves a point by at most about 500 m and never returns the exact input", () => {
    const rounded = roundToMeters(gate);
    expect(rounded).not.toEqual(gate);
    expect(haversineMeters(gate, rounded)).toBeLessThan(500);
  });

  it("is stable for nearby points in the same cell and differs across cells", () => {
    const a = roundToMeters({ lat: 25.1425, lng: 75.834 });
    const b = roundToMeters({ lat: 25.1426, lng: 75.8341 });
    expect(a).toEqual(b);
    const far = roundToMeters({ lat: 25.16, lng: 75.86 });
    expect(far).not.toEqual(a);
  });

  it("hides precision: the output sits on a coarse grid", () => {
    const r = roundToMeters({ lat: 25.123456, lng: 75.987654 });
    // A 500 m grid cannot preserve six decimals of the input.
    expect(haversineMeters({ lat: 25.123456, lng: 75.987654 }, r)).toBeGreaterThan(1);
    const again = roundToMeters(r);
    expect(again).toEqual(r);
  });
});

describe("formatDistance", () => {
  it("formats metres and kilometres for cards", () => {
    expect(formatDistance(0.04)).toBe("40 m");
    expect(formatDistance(0.6)).toBe("0.6 km");
    expect(formatDistance(1.24)).toBe("1.2 km");
    expect(formatDistance(12.4)).toBe("12 km");
  });
});
