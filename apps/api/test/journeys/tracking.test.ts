import request from "supertest";
import { describe, expect, it } from "vitest";
import { createEmailService } from "../../src/modules/mail/email.service.js";
import { runJourneyScan } from "../../src/modules/journeys/journeys.scan.js";
import { createNotificationService } from "../../src/modules/notifications/notifications.service.js";
import {
  buildTestApp,
  createUserWithSession,
  env,
  inlineEmailPublisher,
  prisma,
  silentLogger,
  xhr,
} from "../helpers.js";

const MIN = 60_000;

async function setupTracking() {
  let t = Date.now();
  const clock = { now: () => new Date(t) };
  const advance = (minutes: number) => {
    t += minutes * MIN;
  };
  const publisher = inlineEmailPublisher();
  const { app } = buildTestApp({
    clock,
    publisher,
    limits: { journeyStart: { points: 100, durationSeconds: 3600, key: "user" } },
  });
  const user = await createUserWithSession();
  await prisma.user.update({ where: { id: user.user.id }, data: { fullName: "Asha Verma" } });
  const contact = await prisma.emergencyContact.create({
    data: { userId: user.user.id, name: "Priya", email: "priya@example.test", consentConfirmed: true },
  });
  const email = createEmailService({ prisma, publisher, env });
  const notifications = createNotificationService({ prisma, email, env });
  const scan = () => runJourneyScan({ prisma, clock, email, notifications, env, log: silentLogger });
  const post = (cookie: string, path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(body);

  return { app, user, contact, advance, scan, post, clock };
}

describe("JourneyGuard live tracking", () => {
  it("records location updates, detects route deviation (>250m) once, and blocks non-owners", async () => {
    const { user, contact, post, clock } = await setupTracking();
    const startRes = await post(user.cookie, "/journeys", {
      destinationText: "City Library",
      expectedArrivalAt: new Date(clock.now().getTime() + 30 * MIN).toISOString(),
      emergencyContactId: contact.id,
      trackingEnabled: true,
      startLat: 25.18,
      startLng: 75.85,
      routeGeometry: [
        [75.85, 25.18],
        [75.86, 25.18],
      ],
    });
    expect(startRes.status).toBe(201);
    const id = startRes.body.data.id as string;
    expect(startRes.body.data.trackingEnabled).toBe(true);
    expect(startRes.body.data.safetyState).toBe("NORMAL");

    // On-route update
    const onRoute = await post(user.cookie, `/journeys/${id}/location`, {
      latitude: 25.1801,
      longitude: 75.855,
      accuracyM: 12,
    });
    expect(onRoute.status).toBe(200);
    expect(onRoute.body.data.safetyState).toBe("NORMAL");
    expect(onRoute.body.data.lastLat).toBeCloseTo(25.1801, 4);

    // Deviated update (~550m north)
    const deviated = await post(user.cookie, `/journeys/${id}/location`, {
      latitude: 25.185,
      longitude: 75.855,
    });
    expect(deviated.status).toBe(200);
    expect(deviated.body.data.safetyState).toBe("DEVIATED");

    // Second deviated update should not duplicate DEVIATED event
    await post(user.cookie, `/journeys/${id}/location`, {
      latitude: 25.1855,
      longitude: 75.855,
    });
    const devEvents = await prisma.journeyEvent.count({ where: { journeyId: id, type: "DEVIATED" } });
    expect(devEvents).toBe(1);

    // IDOR check
    const intruder = await createUserWithSession();
    expect(
      (await post(intruder.cookie, `/journeys/${id}/location`, { latitude: 25.18, longitude: 75.85 })).status,
    ).toBe(404);
  });

  it("detects prolonged unexpected stoppage (>=5 min within 30m)", async () => {
    const { user, contact, post, advance, clock } = await setupTracking();
    const startRes = await post(user.cookie, "/journeys", {
      destinationText: "Metro Station",
      expectedArrivalAt: new Date(clock.now().getTime() + 40 * MIN).toISOString(),
      emergencyContactId: contact.id,
      trackingEnabled: true,
      startLat: 25.18,
      startLng: 75.85,
    });
    const id = startRes.body.data.id as string;

    await post(user.cookie, `/journeys/${id}/location`, { latitude: 25.1805, longitude: 75.852 });
    advance(6);
    const stopped = await post(user.cookie, `/journeys/${id}/location`, { latitude: 25.18055, longitude: 75.85205 });
    expect(stopped.status).toBe(200);
    expect(stopped.body.data.safetyState).toBe("STOPPED");

    const stopEvents = await prisma.journeyEvent.count({ where: { journeyId: id, type: "STOPPED" } });
    expect(stopEvents).toBe(1);
  });

  it("triggers manual SOS idempotently and returns emergency number 112", async () => {
    const { user, contact, post, clock } = await setupTracking();
    const startRes = await post(user.cookie, "/journeys", {
      destinationText: "Home",
      expectedArrivalAt: new Date(clock.now().getTime() + 20 * MIN).toISOString(),
      emergencyContactId: contact.id,
      trackingEnabled: true,
    });
    const id = startRes.body.data.id as string;

    const sos1 = await post(user.cookie, `/journeys/${id}/sos`);
    expect(sos1.status).toBe(200);
    expect(sos1.body.data.emergencyNumber).toBe("112");
    expect(sos1.body.data.journey.safetyState).toBe("SOS");

    const sos2 = await post(user.cookie, `/journeys/${id}/sos`);
    expect(sos2.status).toBe(200);
    expect(await prisma.journeyEvent.count({ where: { journeyId: id, type: "SOS_TRIGGERED" } })).toBe(1);
  });

  it("flags LOST_SIGNAL in journey.scan when tracking updates stop for >= 5 minutes", async () => {
    const { user, contact, post, advance, scan, clock } = await setupTracking();
    const startRes = await post(user.cookie, "/journeys", {
      destinationText: "Campus Gate",
      expectedArrivalAt: new Date(clock.now().getTime() + 45 * MIN).toISOString(),
      emergencyContactId: contact.id,
      trackingEnabled: true,
      startLat: 25.18,
      startLng: 75.85,
    });
    const id = startRes.body.data.id as string;

    advance(6);
    await scan();

    const updated = await prisma.journey.findUnique({ where: { id } });
    expect(updated?.safetyState).toBe("LOST_SIGNAL");
    expect(await prisma.journeyEvent.count({ where: { journeyId: id, type: "LOST_SIGNAL" } })).toBe(1);
  });
});
