// Idempotent demo data seed script (Part 0.6 / M6).
// Refuses to run when NODE_ENV === "production" so demo data never reaches production.
import { loadEnv } from "../src/config/env.js";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.js";

const IDS = {
  report1: "11111111-1111-4111-8111-111111111101",
  report2: "11111111-1111-4111-8111-111111111102",
  report3: "11111111-1111-4111-8111-111111111103",
  ride1: "22222222-2222-4222-8222-222222222201",
  ride2: "22222222-2222-4222-8222-222222222202",
  alert1: "33333333-3333-4333-8333-333333333301",
  alert2: "33333333-3333-4333-8333-333333333302",
  journey1: "44444444-4444-4444-8444-444444444401",
  notif1: "55555555-5555-4555-8555-555555555501",
} as const;

export async function seedDemoData(
  prisma: PrismaClient,
  opts?: { nodeEnv?: string },
): Promise<{ users: number; reports: number; rides: number; alerts: number }> {
  const envName = opts?.nodeEnv ?? process.env.NODE_ENV;
  if (envName === "production") {
    throw new Error("Refusing to seed demo data when NODE_ENV=production.");
  }

  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000);

  const student = await prisma.user.upsert({
    where: { email: "demo-student@saferstreets.test" },
    update: {},
    create: {
      email: "demo-student@saferstreets.test",
      emailVerifiedAt: now,
      fullName: "Aarav Mehta",
      phone: "9876501001",
      role: "USER",
      status: "ACTIVE",
      termsAcceptedAt: now,
    },
  });

  const rider = await prisma.user.upsert({
    where: { email: "demo-rider@saferstreets.test" },
    update: {},
    create: {
      email: "demo-rider@saferstreets.test",
      emailVerifiedAt: now,
      fullName: "Priya Nair",
      phone: "9876501002",
      role: "USER",
      status: "ACTIVE",
      termsAcceptedAt: now,
    },
  });

  const mod = await prisma.user.upsert({
    where: { email: "demo-mod@saferstreets.test" },
    update: {},
    create: {
      email: "demo-mod@saferstreets.test",
      emailVerifiedAt: now,
      fullName: "Vikram Rao",
      role: "MODERATOR",
      status: "ACTIVE",
      termsAcceptedAt: now,
    },
  });

  await prisma.user.upsert({
    where: { email: "demo-admin@saferstreets.test" },
    update: {},
    create: {
      email: "demo-admin@saferstreets.test",
      emailVerifiedAt: now,
      fullName: "Ananya Verma",
      role: "ADMIN",
      status: "ACTIVE",
      termsAcceptedAt: now,
    },
  });

  const existingContact = await prisma.emergencyContact.findFirst({
    where: { userId: student.id, email: "guardian@saferstreets.test" },
  });
  const contact =
    existingContact ??
    (await prisma.emergencyContact.create({
      data: {
        userId: student.id,
        name: "Mom",
        email: "guardian@saferstreets.test",
        relationship: "Parent",
        consentConfirmed: true,
      },
    }));

  // SafeRoute reports (Kota service region: 24.9-25.4, 75.6-76.1)
  const reportSeeds = [
    {
      id: IDS.report1,
      authorId: student.id,
      category: "BROKEN_STREETLIGHT" as const,
      title: "Two streetlights out near Vigyan Nagar gate",
      description: "Stretch from the main gate to the bus stop is completely dark after 7 pm.",
      latitude: 25.1524,
      longitude: 75.8452,
      addressText: "Vigyan Nagar Main Road, Kota",
      status: "VERIFIED" as const,
      confirmationCount: 4,
    },
    {
      id: IDS.report2,
      authorId: rider.id,
      category: "POTHOLE" as const,
      title: "Deep pothole near Talwandi circle",
      description: "Waterlogged pothole on the left lane near the coaching centre turn.",
      latitude: 25.1461,
      longitude: 75.8398,
      addressText: "Talwandi Circle, Kota",
      status: "IN_PROGRESS" as const,
      confirmationCount: 3,
    },
    {
      id: IDS.report3,
      authorId: student.id,
      category: "DAMAGED_FOOTPATH" as const,
      title: "Broken footpath slab outside Mahaveer Nagar",
      description: "Uneven concrete slabs force pedestrians onto the main carriageway.",
      latitude: 25.1408,
      longitude: 75.8341,
      addressText: "Mahaveer Nagar II, Kota",
      status: "SUBMITTED" as const,
      confirmationCount: 1,
    },
  ];

  for (const r of reportSeeds) {
    await prisma.report.upsert({
      where: { id: r.id },
      update: {},
      create: r,
    });
  }

  // AutoMate rides
  const rideSeeds = [
    {
      id: IDS.ride1,
      creatorId: rider.id,
      sourceText: "Talwandi Circle",
      sourceLat: 25.1465,
      sourceLng: 75.8401,
      destText: "Kota Junction Railway Station",
      destLat: 25.2233,
      destLng: 75.8819,
      departureAt: hoursFromNow(2),
      seatsTotal: 3,
      seatsTaken: 1,
      estimatedTotalFare: 120,
      status: "OPEN" as const,
      note: "Auto booked from Talwandi stand, 2 seats free.",
    },
    {
      id: IDS.ride2,
      creatorId: student.id,
      sourceText: "Vigyan Nagar",
      sourceLat: 25.1528,
      sourceLng: 75.8458,
      destText: "Rajeev Gandhi Nagar",
      destLat: 25.1419,
      destLng: 75.8442,
      departureAt: hoursFromNow(5),
      seatsTotal: 2,
      seatsTaken: 1,
      estimatedTotalFare: 50,
      status: "OPEN" as const,
      note: "Evening commute, sharing fare equally.",
    },
  ];

  for (const ride of rideSeeds) {
    await prisma.ride.upsert({
      where: { id: ride.id },
      update: {},
      create: ride,
    });
    const hostParticipant = await prisma.rideParticipant.findUnique({
      where: { rideId_userId: { rideId: ride.id, userId: ride.creatorId } },
    });
    if (!hostParticipant) {
      await prisma.rideParticipant.create({
        data: { rideId: ride.id, userId: ride.creatorId },
      });
    }
  }

  // SafeAlert alerts + subscription
  const alertSeeds = [
    {
      id: IDS.alert1,
      authorId: rider.id,
      category: "PUBLIC_HAZARD" as const,
      description:
        "Waterlogging on Jhalawar Road underpass: knee-deep water after evening rain; two-wheelers turning back.",
      latitude: 25.1612,
      longitude: 75.8511,
      addressText: "Jhalawar Road Underpass, Kota",
      status: "VERIFIED" as const,
      verifiedBy: mod.id,
      confirmCount: 5,
      expiresAt: hoursFromNow(5),
    },
    {
      id: IDS.alert2,
      authorId: student.id,
      category: "ROAD_ACCIDENT" as const,
      description: "Minor traffic blockage near Aerodrome Circle: two autos collided on the service lane.",
      latitude: 25.1645,
      longitude: 75.8482,
      addressText: "Aerodrome Circle, Kota",
      status: "ACTIVE" as const,
      confirmCount: 2,
      expiresAt: hoursFromNow(4),
    },
  ];

  for (const alert of alertSeeds) {
    await prisma.alert.upsert({
      where: { id: alert.id },
      update: {},
      create: alert,
    });
  }

  await prisma.alertSubscription.upsert({
    where: { userId: student.id },
    update: {},
    create: {
      userId: student.id,
      enabled: true,
      centerLat: 25.15,
      centerLng: 75.845,
      radiusKm: 3,
      categories: ["ROAD_ACCIDENT", "PUBLIC_HAZARD", "HARASSMENT"],
      emailEnabled: true,
    },
  });

  // Completed JourneyGuard example (never conflicts with the 1-active-journey partial index)
  await prisma.journey.upsert({
    where: { id: IDS.journey1 },
    update: {},
    create: {
      id: IDS.journey1,
      userId: student.id,
      emergencyContactId: contact.id,
      destinationText: "Vigyan Nagar Hostel",
      destLat: 25.153,
      destLng: 75.846,
      expectedArrivalAt: new Date(now.getTime() - 2 * 3_600_000),
      status: "COMPLETED",
      completedAt: new Date(now.getTime() - 2 * 3_600_000),
      trackTokenHash: "demo-completed-journey-hash",
      trackTokenExpiresAt: now,
    },
  });

  await prisma.notification.upsert({
    where: { id: IDS.notif1 },
    update: {},
    create: {
      id: IDS.notif1,
      userId: student.id,
      type: "REPORT_CONFIRMED",
      title: "Your report was confirmed",
      body: "3 neighbours confirmed the broken streetlight near Vigyan Nagar gate.",
      link: `/saferoute/${IDS.report1}`,
    },
  });

  return { users: 4, reports: reportSeeds.length, rides: rideSeeds.length, alerts: alertSeeds.length };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const env = loadEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  try {
    const summary = await seedDemoData(prisma, { nodeEnv: env.NODE_ENV });
    console.log("db:seed complete:", summary);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
