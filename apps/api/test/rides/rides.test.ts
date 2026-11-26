import request from "supertest";
import { describe, expect, it } from "vitest";
import { runRideLifecycle } from "../../src/modules/rides/rides.lifecycle.js";
import { buildTestApp, createUserWithSession, prisma, xhr } from "../helpers.js";

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const A = { text: "Main gate", lat: 28.6139, lng: 77.209 };
const B = { text: "Railway station", lat: 28.6439, lng: 77.219 };
const ride = (over: object = {}) => ({
  source: A,
  destination: B,
  departureAt: hours(2),
  seatsTotal: 3,
  estimatedTotalFare: 300,
  ...over,
});

async function setup() {
  const { app } = buildTestApp();
  const host = await createUserWithSession();
  const rider = await createUserWithSession();
  const post = (cookie: string, path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set(xhr).set("Cookie", cookie).send(body);
  const get = (cookie: string | null, path: string) => {
    const r = request(app).get(`/api/v1${path}`);
    return cookie ? r.set("Cookie", cookie) : r;
  };
  return { app, host, rider, post, get };
}

describe("creating rides", () => {
  it("validates distance, lead time, seats, fare and the open-ride cap", async () => {
    const { host, post } = await setup();
    expect((await post(host.cookie, "/rides", ride())).status).toBe(201);
    expect((await post(host.cookie, "/rides", ride({ destination: { ...A, lat: A.lat + 0.001 } }))).status).toBe(400);
    expect((await post(host.cookie, "/rides", ride({ departureAt: hours(0.1) }))).status).toBe(400);
    expect((await post(host.cookie, "/rides", ride({ departureAt: hours(24 * 15) }))).status).toBe(400);
    expect((await post(host.cookie, "/rides", ride({ seatsTotal: 4 }))).status).toBe(400);
    expect((await post(host.cookie, "/rides", ride({ estimatedTotalFare: 5 }))).status).toBe(400);
    expect((await post(host.cookie, "/rides", ride({ departureAt: hours(30) }))).status).toBe(201);
    expect((await post(host.cookie, "/rides", ride({ departureAt: hours(60) }))).status).toBe(201);
    expect((await post(host.cookie, "/rides", ride({ departureAt: hours(90) }))).status).toBe(409);
  });
});

describe("phone visibility and projections", () => {
  it("shows phones only to the host and accepted riders; guests get no host", async () => {
    const { app, host, rider, post, get } = await setup();
    await prisma.user.update({ where: { id: host.user.id }, data: { phone: "9876543210" } });
    await prisma.user.update({ where: { id: rider.user.id }, data: { phone: "9123456780" } });
    const id = (await post(host.cookie, "/rides", ride())).body.data.id as string;
    const reqId = (await post(rider.cookie, `/rides/${id}/requests`)).body.data.id as string;

    const before = await get(rider.cookie, `/rides/${id}`);
    expect(JSON.stringify(before.body)).not.toContain("9876543210");
    expect(before.body.data.members).toEqual([]);

    expect((await post(host.cookie, `/rides/${id}/requests/${reqId}/accept`)).status).toBe(200);
    const after = await get(rider.cookie, `/rides/${id}`);
    expect(after.body.data.members.map((m: { phone: string }) => m.phone).sort()).toEqual(["9123456780", "9876543210"]);
    expect(after.body.data.joined).toBe(true);
    expect(after.body.data.perPersonFare).toBe(150);

    const stranger = await createUserWithSession();
    expect(JSON.stringify((await get(stranger.cookie, `/rides/${id}`)).body)).not.toMatch(/9876543210|9123456780/);
    const guest = await get(null, `/rides/${id}`);
    expect(guest.status).toBe(200);
    expect(guest.body.data.host).toBeNull();
    expect(JSON.stringify(guest.body)).not.toMatch(/9876543210|9123456780/);
    const list = await get(null, "/rides");
    expect(list.body.data[0].host).toBeNull();
    void app;
  });
});

describe("requests", () => {
  it("blocks own ride, duplicates and overlapping rides; withdraw and re-request work", async () => {
    const { host, rider, post } = await setup();
    const id = (await post(host.cookie, "/rides", ride())).body.data.id as string;
    expect((await post(host.cookie, `/rides/${id}/requests`)).status).toBe(403);
    expect((await post(rider.cookie, `/rides/${id}/requests`)).status).toBe(201);
    expect((await post(rider.cookie, `/rides/${id}/requests`)).status).toBe(409);

    const host2 = await createUserWithSession();
    const near = (await post(host2.cookie, "/rides", ride({ departureAt: hours(2.5) }))).body.data.id as string;
    expect((await post(rider.cookie, `/rides/${near}/requests`)).status).toBe(409); // within 1 h of pending request
    const far = (await post(host2.cookie, "/rides", ride({ departureAt: hours(6) }))).body.data.id as string;
    expect((await post(rider.cookie, `/rides/${far}/requests`)).status).toBe(201);

    const del = await request(buildTestApp().app)
      .delete(`/api/v1/rides/${id}/requests/mine`)
      .set(xhr)
      .set("Cookie", rider.cookie);
    expect(del.status).toBe(200);
    expect((await post(rider.cookie, `/rides/${id}/requests`)).status).toBe(201);
  });

  it("only the host decides, and only once", async () => {
    const { host, rider, post } = await setup();
    const id = (await post(host.cookie, "/rides", ride())).body.data.id as string;
    const reqId = (await post(rider.cookie, `/rides/${id}/requests`)).body.data.id as string;
    expect((await post(rider.cookie, `/rides/${id}/requests/${reqId}/accept`)).status).toBe(404);
    expect((await post(host.cookie, `/rides/${id}/requests/${reqId}/reject`)).status).toBe(200);
    expect((await post(host.cookie, `/rides/${id}/requests/${reqId}/accept`)).status).toBe(409);
  });
});

describe("seats", () => {
  it("50 parallel accepts for the last seat never oversell", async () => {
    const { app, host, post } = await setup();
    const id = (await post(host.cookie, "/rides", ride({ seatsTotal: 1 }))).body.data.id as string;
    const riders = await Promise.all(Array.from({ length: 50 }, () => createUserWithSession()));
    const reqIds: string[] = [];
    for (const r of riders) {
      const res = await request(app).post(`/api/v1/rides/${id}/requests`).set(xhr).set("Cookie", r.cookie).send({});
      expect(res.status).toBe(201);
      reqIds.push(res.body.data.id);
    }
    const results = await Promise.all(
      reqIds.map((q) =>
        request(app).post(`/api/v1/rides/${id}/requests/${q}/accept`).set(xhr).set("Cookie", host.cookie),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(49);
    const row = await prisma.ride.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ seatsTaken: 1, status: "FULL" });
    expect(await prisma.rideParticipant.count({ where: { rideId: id } })).toBe(1);
  }, 60_000);

  it("leaving frees the seat; a full ride cannot be requested", async () => {
    const { host, rider, post, get } = await setup();
    const id = (await post(host.cookie, "/rides", ride({ seatsTotal: 1 }))).body.data.id as string;
    const reqId = (await post(rider.cookie, `/rides/${id}/requests`)).body.data.id as string;
    await post(host.cookie, `/rides/${id}/requests/${reqId}/accept`);
    const other = await createUserWithSession();
    expect((await post(other.cookie, `/rides/${id}/requests`)).status).toBe(409);
    expect((await get(other.cookie, `/rides/${id}`)).body.data).toMatchObject({
      status: "FULL",
      seatsLeft: 0,
      canRequest: false,
    });
    expect((await post(rider.cookie, `/rides/${id}/leave`)).status).toBe(200);
    expect((await get(other.cookie, `/rides/${id}`)).body.data).toMatchObject({ status: "OPEN", seatsLeft: 1 });
  });
});

describe("edit, cancel, lifecycle", () => {
  it("edits with an optimistic version only before anyone joins; cancel needs a reason and notifies", async () => {
    const { host, rider, post, app } = await setup();
    const created = (await post(host.cookie, "/rides", ride())).body.data;
    const patch = (body: object) =>
      request(app).patch(`/api/v1/rides/${created.id}`).set(xhr).set("Cookie", host.cookie).send(body);
    expect((await patch({ version: created.version, estimatedTotalFare: 400 })).status).toBe(200);
    expect((await patch({ version: created.version, estimatedTotalFare: 500 })).status).toBe(409);
    expect(
      (
        await request(app)
          .patch(`/api/v1/rides/${created.id}`)
          .set(xhr)
          .set("Cookie", rider.cookie)
          .send({ version: 1, note: "x" })
      ).status,
    ).toBe(404);

    await post(rider.cookie, `/rides/${created.id}/requests`);
    expect((await post(host.cookie, `/rides/${created.id}/cancel`, { reason: "" })).status).toBe(400);
    expect((await post(host.cookie, `/rides/${created.id}/cancel`, { reason: "Auto broke down" })).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: rider.user.id, type: "RIDE_UPDATE" } })).toBe(1);
    expect((await prisma.rideRequest.findFirstOrThrow({ where: { rideId: created.id } })).status).toBe("CANCELLED");
  });

  it("lifecycle job starts rides, completes them and expires pending requests, using an injected clock", async () => {
    const { host, rider, post } = await setup();
    const id = (await post(host.cookie, "/rides", ride({ departureAt: hours(1) }))).body.data.id as string;
    expect((await post(rider.cookie, `/rides/${id}/requests`)).status).toBe(201);
    const at = (ms: number) => ({ now: () => new Date(Date.now() + ms) });
    // 14 min after departure: still open for the host to start, but the pending request has expired.
    expect(await runRideLifecycle(prisma, at(3_600_000 + 14 * 60_000))).toMatchObject({ started: 0, expired: 1 });
    expect((await prisma.ride.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
    const r1 = await runRideLifecycle(prisma, at(3_600_000 + 16 * 60_000));
    expect(r1).toMatchObject({ started: 1, expired: 0 });
    expect((await prisma.ride.findUniqueOrThrow({ where: { id } })).status).toBe("IN_PROGRESS");
    const r2 = await runRideLifecycle(prisma, at(3_600_000 + 3 * 3_600_000 + 60_000));
    expect(r2.completed).toBe(1);
    expect((await runRideLifecycle(prisma, at(10 * 3_600_000))).started).toBe(0);
  });
});

describe("search and blocking", () => {
  it("filters by route, date and seats; blocked users disappear both ways", async () => {
    const { host, rider, post, get, app } = await setup();
    const id = (await post(host.cookie, "/rides", ride())).body.data.id as string;
    expect((await get(rider.cookie, `/rides?fromLat=${A.lat}&fromLng=${A.lng}`)).body.data).toHaveLength(1);
    expect((await get(rider.cookie, "/rides?fromLat=19.07&fromLng=72.87")).body.data).toHaveLength(0);
    expect((await get(rider.cookie, "/rides?seats=3")).body.data).toHaveLength(1);
    expect((await get(rider.cookie, "/rides?date=2020-01-01")).body.data).toHaveLength(0);

    expect((await post(rider.cookie, `/users/${host.user.id}/block`)).status).toBe(200);
    expect((await get(rider.cookie, "/rides")).body.data).toHaveLength(0);
    expect((await get(rider.cookie, `/rides/${id}`)).status).toBe(404);
    expect((await get(host.cookie, "/rides")).body.data).toHaveLength(1); // the host still sees their own ride
    expect((await post(rider.cookie, `/rides/${id}/requests`)).status).toBe(404);
    expect(
      (await request(app).delete(`/api/v1/users/${host.user.id}/block`).set(xhr).set("Cookie", rider.cookie)).status,
    ).toBe(200);
    expect((await get(rider.cookie, "/rides")).body.data).toHaveLength(1);
  });

  it("my rides tabs", async () => {
    const { host, rider, post, get } = await setup();
    const id = (await post(host.cookie, "/rides", ride())).body.data.id as string;
    await post(rider.cookie, `/rides/${id}/requests`);
    expect((await get(host.cookie, "/rides/mine?role=created")).body.data).toHaveLength(1);
    expect((await get(rider.cookie, "/rides/mine?role=requests")).body.data).toHaveLength(1);
    expect((await get(rider.cookie, "/rides/mine?role=joined")).body.data).toHaveLength(0);
    expect((await get(null, "/rides/mine?role=created")).status).toBe(401);
  });
});
