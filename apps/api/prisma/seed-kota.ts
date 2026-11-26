// Kota-only synthetic demo data for SafeAlert and SafeRoute.
// These are NOT real incidents. Run only against a local/dev database.
// Idempotent: fixed IDs mean rerunning updates the same records, not duplicates.
import { loadEnv } from "../src/config/env.js";
import { createPrisma } from "../src/lib/prisma.js";

const DEMO_USER_EMAIL = "kota-demo-seed@saferstreets.test";
const ID_BASE = 700; // fixed UUID suffixes; reserved for this seed file

const areas = [
  { name: "Kota Junction", lat: 25.2130, lng: 75.8640 },
  { name: "Nayapura", lat: 25.1900, lng: 75.8560 },
  { name: "Gumanpura", lat: 25.1820, lng: 75.8390 },
  { name: "Vigyan Nagar", lat: 25.1670, lng: 75.8360 },
  { name: "Talwandi", lat: 25.1515, lng: 75.8520 },
  { name: "Kunhadi", lat: 25.1410, lng: 75.8760 },
  { name: "Rajiv Gandhi Nagar", lat: 25.1440, lng: 75.8550 },
  { name: "Landmark City", lat: 25.1455, lng: 75.8585 },
  { name: "Dadabari", lat: 25.1760, lng: 75.8240 },
  { name: "Mahaveer Nagar", lat: 25.1408, lng: 75.8341 },
  { name: "Jhalawar Road", lat: 25.1612, lng: 75.8511 },
  { name: "Aerodrome Circle", lat: 25.1590, lng: 75.8450 },
];

const reportSpecs = [
  ["BROKEN_STREETLIGHT", "Streetlights out near main road", "DEMO: Simulated streetlight outage for route scoring.", "VERIFIED"],
  ["POOR_LIGHTING", "Poor lighting on service lane", "DEMO: Synthetic poor-lighting report; not a real incident.", "VERIFIED"],
  ["POTHOLE", "Pothole near junction", "DEMO: Synthetic pothole marker for testing route exposure.", "VERIFIED"],
  ["DAMAGED_ROAD", "Uneven road surface", "DEMO: Synthetic damaged-road report.", "VERIFIED"],
  ["DAMAGED_FOOTPATH", "Broken footpath section", "DEMO: Synthetic footpath obstruction report.", "VERIFIED"],
  ["ISOLATED_AREA", "Low activity stretch", "DEMO: Synthetic isolated-area report; not a real safety claim.", "VERIFIED"],
  ["POOR_LIGHTING", "Dark approach near bus stop", "DEMO: Synthetic lighting issue near a bus stop.", "VERIFIED"],
  ["POTHOLE", "Road damage on inner road", "DEMO: Synthetic road-damage report.", "VERIFIED"],
  ["BROKEN_STREETLIGHT", "Lamp outage near coaching area", "DEMO: Synthetic lamp outage.", "VERIFIED"],
  ["ISOLATED_AREA", "Quiet lane after evening", "DEMO: Synthetic low-activity route marker.", "VERIFIED"],
  ["DAMAGED_ROAD", "Damaged road edge", "DEMO: Synthetic road-edge damage.", "VERIFIED"],
  ["DAMAGED_FOOTPATH", "Footpath slab damage", "DEMO: Synthetic footpath damage.", "VERIFIED"],
  ["POOR_LIGHTING", "Lighting issue near crossing", "DEMO: Synthetic crossing-lighting report.", "VERIFIED"],
  ["POTHOLE", "Pothole on approach road", "DEMO: Synthetic pothole marker.", "VERIFIED"],
  ["BROKEN_STREETLIGHT", "Streetlamp not working", "DEMO: Synthetic streetlamp report.", "VERIFIED"],
  ["ISOLATED_AREA", "Low pedestrian activity near park", "DEMO: Synthetic low-activity marker.", "VERIFIED"],
  ["DAMAGED_ROAD", "Broken pavement near market", "DEMO: Synthetic pavement issue.", "VERIFIED"],
  ["POOR_LIGHTING", "Unlit stretch near residential block", "DEMO: Synthetic unlit-road report.", "VERIFIED"],
  ["POTHOLE", "Small pothole near service road", "DEMO: Synthetic pothole report.", "SUBMITTED"],
  ["ISOLATED_AREA", "Quiet stretch awaiting confirmation", "DEMO: Pending synthetic report.", "SUBMITTED"],
  ["POOR_LIGHTING", "Lighting report under review", "DEMO: Pending synthetic report.", "UNDER_REVIEW"],
  ["POTHOLE", "Resolved pothole fixture", "DEMO: Resolved control; should not count as an active hazard.", "RESOLVED"],
  ["BROKEN_STREETLIGHT", "Rejected duplicate lamp report", "DEMO: Rejected control; should not count as an active hazard.", "REJECTED"],
  ["DAMAGED_ROAD", "Resolved road damage fixture", "DEMO: Resolved control for filtering tests.", "RESOLVED"],
] as const;

const alertSpecs = [
  ["HARASSMENT", "Personal safety alert near transit", "DEMO ALERT: Synthetic harassment alert for map and route scoring.", "VERIFIED"],
  ["ROAD_ACCIDENT", "Traffic accident near junction", "DEMO ALERT: Synthetic accident marker; not a real incident.", "VERIFIED"],
  ["MEDICAL", "Medical assistance test alert", "DEMO ALERT: Synthetic medical alert for testing.", "ACTIVE"],
  ["FIRE", "Fire hazard test marker", "DEMO ALERT: Synthetic fire marker; not a real emergency.", "VERIFIED"],
  ["PUBLIC_HAZARD", "Waterlogging test marker", "DEMO ALERT: Synthetic public-hazard marker.", "VERIFIED"],
  ["OTHER", "Community safety test alert", "DEMO ALERT: Synthetic general alert.", "ACTIVE"],
  ["HARASSMENT", "Personal safety marker near coaching area", "DEMO ALERT: Synthetic safety marker.", "VERIFIED"],
  ["ROAD_ACCIDENT", "Collision test marker near main road", "DEMO ALERT: Synthetic road-accident marker.", "ACTIVE"],
  ["PUBLIC_HAZARD", "Road obstruction test marker", "DEMO ALERT: Synthetic obstruction marker.", "VERIFIED"],
  ["MEDICAL", "Medical response test marker", "DEMO ALERT: Synthetic medical marker.", "VERIFIED"],
  ["FIRE", "Smoke/fire test marker", "DEMO ALERT: Synthetic fire marker.", "ACTIVE"],
  ["OTHER", "General alert near residential lane", "DEMO ALERT: Synthetic general alert.", "VERIFIED"],
  ["HARASSMENT", "Safety concern test marker", "DEMO ALERT: Synthetic personal-safety marker.", "VERIFIED"],
  ["ROAD_ACCIDENT", "Traffic blockage test marker", "DEMO ALERT: Synthetic traffic marker.", "VERIFIED"],
  ["PUBLIC_HAZARD", "Hazard near crossing test marker", "DEMO ALERT: Synthetic public hazard.", "ACTIVE"],
  ["MEDICAL", "Medical emergency test marker", "DEMO ALERT: Synthetic medical emergency fixture.", "VERIFIED"],
  ["FIRE", "Fire-service test marker", "DEMO ALERT: Synthetic fire fixture.", "VERIFIED"],
  ["OTHER", "Resolved alert control", "DEMO ALERT: Resolved control; should not appear as active.", "RESOLVED"],
  ["HARASSMENT", "Dismissed alert control", "DEMO ALERT: Dismissed control; should not affect route score.", "DISMISSED"],
  ["ROAD_ACCIDENT", "Expired alert control", "DEMO ALERT: Expired control; should not affect route score.", "EXPIRED"],
] as const;

function demoId(n: number): string {
  // Valid deterministic UUIDs, stable between runs.
  return `77777777-7777-4777-8777-${String(ID_BASE + n).padStart(12, "0")}`;
}

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to insert synthetic Kota demo records in production.");
  }

  const prisma = createPrisma(env.DATABASE_URL);
  try {
    const now = new Date();
    const demoUser = await prisma.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      update: { status: "ACTIVE", deletedAt: null },
      create: {
        email: DEMO_USER_EMAIL,
        emailVerifiedAt: now,
        fullName: "Kota Demo Data",
        role: "USER",
        status: "ACTIVE",
        termsAcceptedAt: now,
      },
    });

    let reportsInsertedOrUpdated = 0;
    for (let i = 0; i < reportSpecs.length; i++) {
      const [category, title, description, status] = reportSpecs[i]!;
      const area = areas[i % areas.length]!;
      const lat = area.lat + ((i % 3) - 1) * 0.00045;
      const lng = area.lng + (((Math.floor(i / 3)) % 3) - 1) * 0.0005;
      const id = demoId(i + 1);
      const data = {
        authorId: demoUser.id,
        category,
        title: `[DEMO KOTA] ${title} — ${area.name}`.slice(0, 80),
        description: `${description} Location: ${area.name}, Kota, Rajasthan. Synthetic fixture only.`,
        latitude: lat,
        longitude: lng,
        addressText: `${area.name}, Kota, Rajasthan`,
        status,
        confirmationCount: status === "VERIFIED" ? (i % 4 === 0 ? 4 : 2) : 0,
        resolvedAt: status === "RESOLVED" ? now : null,
      };
      await prisma.report.upsert({ where: { id }, update: data, create: { id, ...data } });
      reportsInsertedOrUpdated++;
    }

    let alertsInsertedOrUpdated = 0;
    for (let i = 0; i < alertSpecs.length; i++) {
      const [category, title, description, status] = alertSpecs[i]!;
      const area = areas[(i * 5 + 2) % areas.length]!;
      const lat = area.lat + ((i % 4) - 1.5) * 0.00035;
      const lng = area.lng + (((Math.floor(i / 4)) % 3) - 1) * 0.00045;
      const id = demoId(100 + i);
      const expiresAt = status === "EXPIRED"
        ? new Date(now.getTime() - 60_000)
        : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const data = {
        authorId: demoUser.id,
        category,
        description: `${description} Location: ${area.name}, Kota, Rajasthan. Synthetic fixture only.`.slice(0, 500),
        latitude: lat,
        longitude: lng,
        addressText: `${area.name}, Kota, Rajasthan`.slice(0, 200),
        status,
        isAnonymous: true,
        confirmCount: status === "VERIFIED" ? 2 : 0,
        disputeCount: 0,
        needsReviewFirst: false,
        verifiedBy: null,
        resolvedAt: status === "RESOLVED" ? now : null,
        expiresAt,
      };
      await prisma.alert.upsert({ where: { id }, update: data, create: { id, ...data } });
      alertsInsertedOrUpdated++;
    }

    console.log(`Kota demo seed complete: ${reportsInsertedOrUpdated} reports, ${alertsInsertedOrUpdated} alerts.`);
    console.log("All seeded records are synthetic and marked [DEMO KOTA].");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
