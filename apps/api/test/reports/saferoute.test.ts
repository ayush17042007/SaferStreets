import request from "supertest";
import { describe, expect, it } from "vitest";
import { distanceToPolylineM, scoreRouteAlternatives } from "../../src/modules/reports/saferoute.scoring.js";
import type { RawRouteAlternative } from "../../src/modules/geo/routing.client.js";
import { buildTestApp, createUser, prisma, xhr } from "../helpers.js";

describe("SafeRoute scoring", () => {
  it("computes distance from a point to a polyline accurately", () => {
    const line: Array<[number, number]> = [
      [75.85, 25.18],
      [75.86, 25.18],
    ];
    expect(distanceToPolylineM(25.18, 75.855, line)).toBeLessThan(1);
    // ~0.002 deg north is ~221 m
    const off = distanceToPolylineM(25.182, 75.855, line);
    expect(off).toBeGreaterThan(200);
    expect(off).toBeLessThan(240);
  });

  it("scores safer routes higher, discounts resolved/rejected reports, and explains recommendation", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const routeA: RawRouteAlternative = {
      id: "route-a",
      label: "Route 1",
      distanceM: 1200,
      durationS: 600,
      coordinates: [
        [75.85, 25.18],
        [75.86, 25.18],
      ],
    };
    const routeB: RawRouteAlternative = {
      id: "route-b",
      label: "Route 2",
      distanceM: 1400,
      durationS: 720,
      coordinates: [
        [75.85, 25.19],
        [75.86, 25.19],
      ],
    };

    const { routes, recommendedRouteId } = scoreRouteAlternatives(
      [routeA, routeB],
      [
        {
          id: "rep-1",
          category: "POOR_LIGHTING",
          title: "Dark stretch near park",
          status: "VERIFIED",
          latitude: 25.1802,
          longitude: 75.855,
          confirmationCount: 3,
          createdAt: now,
        },
        {
          id: "rep-2",
          category: "ISOLATED_AREA",
          title: "Old resolved report",
          status: "RESOLVED",
          latitude: 25.1901,
          longitude: 75.855,
          confirmationCount: 0,
          createdAt: now,
        },
        {
          id: "rep-3",
          category: "POTHOLE",
          title: "Rejected report",
          status: "REJECTED",
          latitude: 25.1901,
          longitude: 75.856,
          confirmationCount: 0,
          createdAt: now,
        },
      ],
      [
        {
          id: "alert-1",
          category: "HARASSMENT",
          description: "Active harassment alert on main road",
          status: "VERIFIED",
          latitude: 25.1801,
          longitude: 75.854,
          confirmCount: 2,
          createdAt: now,
        },
      ],
      now,
    );

    expect(recommendedRouteId).toBe("route-b");
    const a = routes.find((r) => r.id === "route-a")!;
    const b = routes.find((r) => r.id === "route-b")!;
    expect(b.safetyScore).toBeGreaterThan(a.safetyScore);
    expect(a.incidentCount).toBe(2);
    expect(a.alertCount).toBe(1);
    expect(a.verifiedCount).toBe(2);
    expect(b.explanation).toContain("Recommended:");
    expect(a.explanation).toContain("Alternative");
  });

  it("returns 100 when no incidents exist along any route", () => {
    const now = new Date();
    const { routes, recommendedRouteId } = scoreRouteAlternatives(
      [
        {
          id: "r1",
          label: "Route 1",
          distanceM: 500,
          durationS: 300,
          coordinates: [
            [75.85, 25.18],
            [75.855, 25.18],
          ],
        },
      ],
      [],
      [],
      now,
    );
    expect(recommendedRouteId).toBe("r1");
    expect(routes[0]!.safetyScore).toBe(100);
  });
});

describe("POST /api/v1/saferoute/routes", () => {
  it("returns 503 when no routing provider is configured", async () => {
    const { app } = buildTestApp({ routing: null });
    const res = await request(app)
      .post("/api/v1/saferoute/routes")
      .set(xhr)
      .send({ originLat: 25.18, originLng: 75.85, destLat: 25.185, destLng: 75.86 });
    expect(res.status).toBe(503);
  });

  it("scores returned route alternatives against real database reports", async () => {
    const reporter = await createUser();
    await prisma.report.create({
      data: {
        authorId: reporter.id,
        category: "POOR_LIGHTING",
        title: "Unlit road segment",
        description: "Streetlights out for 200m",
        status: "VERIFIED",
        latitude: 25.1801,
        longitude: 75.855,
      },
    });

    const { app } = buildTestApp({
      routing: {
        getAlternatives: async () => [
          {
            id: "alt-1",
            label: "Via Main Rd",
            distanceM: 1100,
            durationS: 500,
            coordinates: [
              [75.85, 25.18],
              [75.86, 25.18],
            ],
          },
          {
            id: "alt-2",
            label: "Via Park Ave",
            distanceM: 1300,
            durationS: 600,
            coordinates: [
              [75.85, 25.19],
              [75.86, 25.19],
            ],
          },
        ],
      },
    });

    const res = await request(app)
      .post("/api/v1/saferoute/routes")
      .set(xhr)
      .send({ originLat: 25.18, originLng: 75.85, destLat: 25.19, destLng: 75.86 });

    expect(res.status).toBe(200);
    expect(res.body.data.recommendedRouteId).toBe("alt-2");
    expect(res.body.data.routes).toHaveLength(2);
    const alt1 = res.body.data.routes.find((r: { id: string }) => r.id === "alt-1");
    expect(alt1.incidentCount).toBe(1);
    expect(alt1.safetyScore).toBeLessThan(100);
  });
});
