import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REGION, type Region } from "@saferstreets/shared";
import { LruCache } from "../../src/lib/lru.js";
import { createMapTilerClient, type GeoClient } from "../../src/modules/geo/geo.client.js";
import { buildTestApp, prisma } from "../helpers.js";
import { loginOnboarded } from "../authHelpers.js";

function fakeGeo() {
  const search = vi.fn(async (q: string, _region: Region) => [
    { label: `${q} Gate 2, Kota`, lat: 25.1425, lng: 75.834 },
    { label: `${q} (Delhi)`, lat: 28.6139, lng: 77.209 }, // outside the region: must be filtered
  ]);
  const reverse = vi.fn(async () => "Main Road, near Gate 2, Kota");
  return { client: { search, reverse } satisfies GeoClient, search, reverse };
}

describe("LruCache", () => {
  it("evicts the least recently used entry and expires by TTL", () => {
    let t = 0;
    const c = new LruCache<number>(2, 1000, () => t);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1); // a is now most recent
    c.set("c", 3); // evicts b
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    t = 1001;
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBeLessThanOrEqual(2);
  });
});

describe("GET /geo/search and /geo/reverse", () => {
  it("require a session", async () => {
    const { app } = buildTestApp({ geo: fakeGeo().client });
    expect((await request(app).get("/api/v1/geo/search?q=gate")).status).toBe(401);
    expect((await request(app).get("/api/v1/geo/reverse?lat=25.14&lng=75.83")).status).toBe(401);
  });

  it("answers 503 plainly when no map key is configured", async () => {
    const { app } = buildTestApp({ geo: null });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const res = await request(app).get("/api/v1/geo/search?q=gate").set("Cookie", cookie);
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe("Place search isn't set up yet.");
  });

  it("returns matching places and caches repeated searches", async () => {
    const geo = fakeGeo();
    const { app } = buildTestApp({ geo: geo.client });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const a = await request(app).get("/api/v1/geo/search?q=Hostel").set("Cookie", cookie);
    expect(a.status).toBe(200);
    expect(a.body.data).toEqual([
      { label: "Hostel Gate 2, Kota", lat: 25.1425, lng: 75.834 },
      { label: "Hostel (Delhi)", lat: 28.6139, lng: 77.209 },
    ]);
    await request(app).get("/api/v1/geo/search?q=%20hostel%20").set("Cookie", cookie);
    expect(geo.search).toHaveBeenCalledTimes(1); // second call (same text, different case/spacing) came from the cache
    expect(geo.search.mock.calls[0]![1]).toMatchObject(DEFAULT_REGION);
  });

  it("validates the query and coordinates", async () => {
    const { app } = buildTestApp({ geo: fakeGeo().client });
    const cookie = await loginOnboarded(app, "riya@example.test");
    expect((await request(app).get("/api/v1/geo/search?q=a").set("Cookie", cookie)).status).toBe(400);
    expect((await request(app).get("/api/v1/geo/search").set("Cookie", cookie)).status).toBe(400);
    expect((await request(app).get("/api/v1/geo/reverse?lat=95&lng=75").set("Cookie", cookie)).status).toBe(400);
    expect((await request(app).get("/api/v1/geo/reverse?lat=x&lng=75").set("Cookie", cookie)).status).toBe(400);
  });

  it("reverse geocodes and caches by rounded coordinates", async () => {
    const geo = fakeGeo();
    const { app } = buildTestApp({ geo: geo.client });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const r = await request(app).get("/api/v1/geo/reverse?lat=25.14251&lng=75.83401").set("Cookie", cookie);
    expect(r.body.data.label).toBe("Main Road, near Gate 2, Kota");
    await request(app).get("/api/v1/geo/reverse?lat=25.14251&lng=75.83401").set("Cookie", cookie);
    expect(geo.reverse).toHaveBeenCalledTimes(1);
  });

  it("turns a provider failure into a calm 503 without leaking details", async () => {
    const client: GeoClient = {
      search: async () => Promise.reject(new Error("MapTiler key=SECRET exploded")),
      reverse: async () => Promise.reject(new Error("boom")),
    };
    const { app } = buildTestApp({ geo: client });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const s = await request(app).get("/api/v1/geo/search?q=gate").set("Cookie", cookie);
    expect(s.status).toBe(503);
    expect(JSON.stringify(s.body)).not.toContain("SECRET");
    const r = await request(app).get("/api/v1/geo/reverse?lat=25.14&lng=75.83").set("Cookie", cookie);
    expect(r.status).toBe(503);
  });

  it("rate limits each user (429 with Retry-After)", async () => {
    const { app } = buildTestApp({
      geo: fakeGeo().client,
      limits: { geoSearch: { points: 2, durationSeconds: 60, key: "user" } },
    });
    const cookie = await loginOnboarded(app, "riya@example.test");
    for (const q of ["aa", "bb"])
      expect((await request(app).get(`/api/v1/geo/search?q=${q}`).set("Cookie", cookie)).status).toBe(200);
    const third = await request(app).get("/api/v1/geo/search?q=cc").set("Cookie", cookie);
    expect(third.status).toBe(429);
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("MapTiler client", () => {
  it("parses current MapTiler POI response and keeps coordinates", async () => {
    expect(createMapTilerClient(undefined)).toBeNull();

    const urls: string[] = [];

    const responses = [
      {
        features: [
          {
            properties: {
              place: "Seven Wonders Park, Rajasthan, India",
              text: "Seven Wonders Park",
              place_type: "poi",
            },
            geometry: {
              type: "Point",
              coordinates: [75.8486905, 25.1799241],
            },
          },
        ],
      },
      {
        features: [
          {
            properties: {
              place_name: "Main Road, Kota, Rajasthan, India",
            },
            geometry: {
              type: "Point",
              coordinates: [75.83, 25.14],
            },
          },
        ],
      },
    ];

    const client = createMapTilerClient("test-key", (async (input: URL) => {
      urls.push(String(input));

      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as unknown as typeof fetch)!;

    const places = await client.search("Seven Wonders Park Kota", DEFAULT_REGION);

    expect(places).toEqual([
      {
        label: "Seven Wonders Park, Rajasthan, India",
        lat: 25.1799241,
        lng: 75.8486905,
      },
    ]);

    const searchUrl = new URL(urls[0]!);

    expect(searchUrl.searchParams.get("types")).toContain("poi");
    expect(searchUrl.searchParams.get("autocomplete")).toBe("true");
    expect(searchUrl.searchParams.get("country")).toBe("in");

    const address = await client.reverse(25.14, 75.83);

    expect(address).toBe("Main Road, Kota, Rajasthan, India");
  });
});

describe("GET /public/region", () => {
  it("returns the configured box (default Kota area) with no session", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/v1/public/region");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ minLat: 24.9, maxLat: 25.4, minLng: 75.6, maxLng: 76.1 });
  });

  it("follows system settings", async () => {
    await prisma.systemSetting.create({
      data: { key: "serviceRegion", value: { minLat: 10, maxLat: 11, minLng: 76, maxLng: 77 } },
    });
    const { app } = buildTestApp();
    const res = await request(app).get("/api/v1/public/region");
    expect(res.body.data).toEqual({ minLat: 10, maxLat: 11, minLng: 76, maxLng: 77 });
  });
});
