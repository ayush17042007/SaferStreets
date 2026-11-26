import request from "supertest";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../src/lib/clock.js";
import { buildTestApp, prisma } from "../helpers.js";
import { loginOnboarded } from "../authHelpers.js";

const CARDS = ["setup", "journey", "alerts", "rides", "reports", "snapshot"] as const;
const get = (app: Parameters<typeof request>[0], cookie: string, card: string) =>
  request(app).get(`/api/v1/me/dashboard/${card}`).set("Cookie", cookie);

async function userId(email: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

describe("dashboard endpoints: access", () => {
  it("every card needs a session and is never cacheable", async () => {
    const { app } = buildTestApp();
    for (const c of CARDS) expect((await request(app).get(`/api/v1/me/dashboard/${c}`)).status, c).toBe(401);
    const cookie = await loginOnboarded(app, "riya@example.test");
    for (const c of CARDS) {
      const res = await get(app, cookie, c);
      expect(res.status, c).toBe(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
    }
  });
});

describe("dashboard endpoints: empty states", () => {
  it("a brand new user gets empty answers (the A5.2 empty states)", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test", "Riya Sharma");
    expect((await get(app, cookie, "setup")).body.data).toEqual({
      firstName: "Riya",
      contactCount: 0,
      alertArea: null,
    });
    expect((await get(app, cookie, "journey")).body.data).toBeNull();
    expect((await get(app, cookie, "alerts")).body.data).toEqual({ hasArea: false, items: [] });
    expect((await get(app, cookie, "rides")).body.data).toBeNull();
    expect((await get(app, cookie, "reports")).body.data).toEqual({ thisWeek: 0, items: [] });
    expect((await get(app, cookie, "snapshot")).body.data).toEqual({
      scope: "service-region",
      activeReports: 0,
      activeAlerts: 0,
      openRides: 0,
    });
  });
});

describe("dashboard endpoints: real data, scoped to the viewer", () => {
  it("setup reflects trusted contacts and the saved alert area", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test");
    const id = await userId("riya@example.test");
    await prisma.emergencyContact.create({
      data: { userId: id, name: "Mom", email: "mom@example.test", consentConfirmed: true },
    });
    await prisma.alertSubscription.create({
      data: { userId: id, enabled: true, centerLat: 25.14, centerLng: 75.83, radiusKm: 3 },
    });
    expect((await get(app, cookie, "setup")).body.data).toEqual({
      firstName: "Riya",
      contactCount: 1,
      alertArea: { radiusKm: 3 },
    });
  });

  it("journey shows the active journey with the contact's name, and nothing from other users", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const other = await loginOnboarded(app, "arjun@example.test", "Arjun K");
    const id = await userId("riya@example.test");
    const contact = await prisma.emergencyContact.create({
      data: { userId: id, name: "Mom", email: "mom@example.test", consentConfirmed: true },
    });
    const now = clock.now();
    await prisma.journey.create({
      data: {
        userId: id,
        emergencyContactId: contact.id,
        destinationText: "Railway Station",
        startText: "Hostel Gate",
        startedAt: new Date(now.getTime() - 20 * 60_000),
        expectedArrivalAt: new Date(now.getTime() + 20 * 60_000),
        trackTokenHash: "hash-dash-1",
        trackTokenExpiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    const res = await get(app, cookie, "journey");
    expect(res.body.data).toMatchObject({
      status: "ACTIVE",
      startText: "Hostel Gate",
      destinationText: "Railway Station",
      contactName: "Mom",
      minutesLeft: 20,
      progressPct: 50,
      contactNotified: false,
    });
    expect((await get(app, other, "journey")).body.data).toBeNull();
  });

  it("alerts: only active alerts inside the saved area, nearest info, never review-pending ones", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const id = await userId("riya@example.test");
    const author = await prisma.user.create({ data: { email: "author@example.test" } });
    await prisma.alertSubscription.create({
      data: { userId: id, enabled: true, centerLat: 25.14, centerLng: 75.83, radiusKm: 3 },
    });
    const base = {
      authorId: author.id,
      description: "Two-wheeler collision at the crossing.",
      addressText: "Station Rd crossing",
      expiresAt: new Date(clock.now().getTime() + 6 * 3600_000),
    };
    await prisma.alert.createMany({
      data: [
        { ...base, category: "ROAD_ACCIDENT", latitude: 25.145, longitude: 75.835 }, // inside
        { ...base, category: "FIRE", latitude: 25.3, longitude: 75.83 }, // outside the 3 km radius
        { ...base, category: "MEDICAL", latitude: 25.141, longitude: 75.831, needsReviewFirst: true }, // not yet visible
        { ...base, category: "PUBLIC_HAZARD", latitude: 25.142, longitude: 75.832, status: "DISMISSED" },
        {
          ...base,
          category: "MEDICAL",
          latitude: 25.141,
          longitude: 75.831,
          expiresAt: new Date(clock.now().getTime() - 1000),
        },
      ],
    });
    const res = await get(app, cookie, "alerts");
    expect(res.body.data.hasArea).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      title: "Road accident",
      addressText: "Station Rd crossing",
      status: "ACTIVE",
    });
    expect(res.body.data.items[0].distanceKm).toBeLessThan(3);
    expect(JSON.stringify(res.body)).not.toContain("collision"); // description is not part of the card
  });

  it("rides: the next upcoming ride for the creator and for an accepted rider, not for strangers", async () => {
    const clock = fixedClock(new Date());
    const { app } = buildTestApp({ clock });
    const creatorCookie = await loginOnboarded(app, "riya@example.test");
    const riderCookie = await loginOnboarded(app, "arjun@example.test", "Arjun K");
    const strangerCookie = await loginOnboarded(app, "meera@example.test", "Meera P");
    const creator = await userId("riya@example.test");
    const rider = await userId("arjun@example.test");
    const soon = new Date(clock.now().getTime() + 3600_000);
    const later = new Date(clock.now().getTime() + 5 * 3600_000);
    const mk = (departureAt: Date, text: string) =>
      prisma.ride.create({
        data: {
          creatorId: creator,
          sourceText: text,
          sourceLat: 25.14,
          sourceLng: 75.83,
          destText: "Bus Stand",
          destLat: 25.16,
          destLng: 75.85,
          departureAt,
          seatsTotal: 3,
          estimatedTotalFare: 120,
        },
      });
    const later1 = await mk(later, "Later ride");
    const soon1 = await mk(soon, "Campus");
    await prisma.rideParticipant.create({ data: { rideId: soon1.id, userId: rider } });
    await prisma.ride.update({ where: { id: soon1.id }, data: { seatsTaken: 1 } });
    void later1;

    const c = await get(app, creatorCookie, "rides");
    expect(c.body.data).toMatchObject({
      sourceText: "Campus",
      destText: "Bus Stand",
      othersCount: 1,
      perPersonFare: 60,
      isCreator: true,
    });
    const r = await get(app, riderCookie, "rides");
    expect(r.body.data).toMatchObject({ sourceText: "Campus", isCreator: false });
    expect((await get(app, strangerCookie, "rides")).body.data).toBeNull();
  });

  it("reports: my latest three and this week's count, never someone else's, never deleted ones", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test");
    await loginOnboarded(app, "arjun@example.test", "Arjun K");
    const me = await userId("riya@example.test");
    const other = await userId("arjun@example.test");
    const mk = (authorId: string, title: string, extra: object = {}) =>
      prisma.report.create({
        data: {
          authorId,
          category: "BROKEN_STREETLIGHT",
          title,
          description: "Three lights are off near the gate.",
          latitude: 25.14,
          longitude: 75.83,
          ...extra,
        },
      });
    await mk(me, "Report one");
    await mk(me, "Report two");
    await mk(me, "Report three");
    await mk(me, "Report four", { createdAt: new Date(Date.now() - 10 * 86_400_000) });
    await mk(me, "Deleted report", { deletedAt: new Date() });
    await mk(other, "Not mine");
    const res = await get(app, cookie, "reports");
    expect(res.body.data.thisWeek).toBe(3);
    expect(res.body.data.items).toHaveLength(3);
    const titles = res.body.data.items.map((i: { title: string }) => i.title);
    expect(titles).not.toContain("Not mine");
    expect(titles).not.toContain("Deleted report");
  });

  it("snapshot counts live items inside the alert area, else inside the service region", async () => {
    const { app } = buildTestApp();
    const cookie = await loginOnboarded(app, "riya@example.test");
    const me = await userId("riya@example.test");
    await prisma.report.create({
      data: {
        authorId: me,
        category: "POTHOLE",
        title: "Pothole on Ring Rd",
        description: "A deep pothole on the road.",
        latitude: 25.14,
        longitude: 75.83,
      },
    });
    await prisma.report.create({
      data: {
        authorId: me,
        category: "POTHOLE",
        title: "Resolved one",
        description: "Fixed already by the council.",
        latitude: 25.14,
        longitude: 75.83,
        status: "RESOLVED",
      },
    });
    await prisma.report.create({
      data: {
        authorId: me,
        category: "POTHOLE",
        title: "Far away one",
        description: "In another city entirely.",
        latitude: 28.6,
        longitude: 77.2,
      },
    });
    const region = await get(app, cookie, "snapshot");
    expect(region.body.data).toMatchObject({ scope: "service-region", activeReports: 1 });
    await prisma.alertSubscription.create({
      data: { userId: me, enabled: true, centerLat: 25.14, centerLng: 75.83, radiusKm: 2 },
    });
    const area = await get(app, cookie, "snapshot");
    expect(area.body.data).toMatchObject({ scope: "alert-area", activeReports: 1 });
  });
});
