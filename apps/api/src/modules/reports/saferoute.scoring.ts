// Transparent safety scoring for route alternatives using real reports and active alerts.
import { haversineKm, type IncidentMapPin, type RouteAlternativeDto, type RouteHazardDto } from "@saferstreets/shared";
import type { RawRouteAlternative } from "../geo/routing.client.js";

export interface SafetyReportInput {
  id: string;
  category: string;
  title: string;
  status: string;
  latitude: number;
  longitude: number;
  confirmationCount: number;
  createdAt: Date;
}

export interface SafetyAlertInput {
  id: string;
  category: string;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  confirmCount: number;
  disputeCount?: number;
  createdAt: Date;
}

const CORRIDOR_M = 200;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const REPORT_WEIGHT: Record<string, number> = {
  ISOLATED_AREA: 1.6,
  POOR_LIGHTING: 1.4,
  BROKEN_STREETLIGHT: 1.3,
  DAMAGED_FOOTPATH: 1.0,
  DAMAGED_ROAD: 1.0,
  POTHOLE: 0.9,
  OTHER: 0.8,
};

const ALERT_WEIGHT: Record<string, number> = {
  HARASSMENT: 2.4,
  FIRE: 2.2,
  ROAD_ACCIDENT: 1.9,
  MEDICAL: 1.5,
  PUBLIC_HAZARD: 1.8,
  OTHER: 1.4,
};

/** Shortest distance in meters from point (lat, lng) to segment AB ([lng, lat]). */
export function pointToSegmentDistanceM(
  lat: number,
  lng: number,
  a: [number, number],
  b: [number, number],
): number {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const ax = (a[0] - lng) * 111_320 * cosLat;
  const ay = (a[1] - lat) * 110_540;
  const bx = (b[0] - lng) * 111_320 * cosLat;
  const by = (b[1] - lat) * 110_540;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(ax, ay);
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Shortest distance in meters from point (lat, lng) to a polyline of [lng, lat] pairs. */
export function distanceToPolylineM(lat: number, lng: number, coords: Array<[number, number]>): number {
  if (coords.length === 0) return Number.POSITIVE_INFINITY;
  if (coords.length === 1) return haversineKm({ lat, lng }, { lat: coords[0]![1], lng: coords[0]![0] }) * 1000;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentDistanceM(lat, lng, coords[i]!, coords[i + 1]!);
    if (d < min) min = d;
  }
  return min;
}

export function scoreRouteAlternatives(
  routes: RawRouteAlternative[],
  reports: SafetyReportInput[],
  alerts: SafetyAlertInput[],
  now: Date,
): { routes: RouteAlternativeDto[]; recommendedRouteId: string; incidentPins: IncidentMapPin[] } {
  // Collect all incidents that appear near any route for map display (deduped by id).
  const pinMap = new Map<string, IncidentMapPin>();

  const scored: RouteAlternativeDto[] = routes.map((route) => {
    let penalty = 0;
    let incidentCount = 0;
    let verifiedCount = 0;
    let alertCount = 0;
    const hazards: RouteHazardDto[] = [];

    for (const r of reports) {
      if (r.status === "REJECTED") continue;
      const d = distanceToPolylineM(r.latitude, r.longitude, route.coordinates);
      if (d > CORRIDOR_M) continue;

      incidentCount++;
      const isVerified = r.status === "VERIFIED" || r.status === "IN_PROGRESS";
      if (isVerified) verifiedCount++;

      const base = REPORT_WEIGHT[r.category] ?? 1.0;
      const statusMult = r.status === "RESOLVED" ? 0.15 : isVerified ? 1.5 : 1.0;
      const ageDays = Math.max(0, (now.getTime() - r.createdAt.getTime()) / DAY_MS);
      const freshness = Math.max(0.35, 1 - (ageDays / 30) * 0.65);
      const confirmMult = 1 + Math.min(r.confirmationCount, 5) * 0.1;

      penalty += base * statusMult * freshness * confirmMult;
      hazards.push({
        id: r.id,
        kind: "report",
        category: r.category,
        title: r.title,
        status: r.status,
        distanceM: Math.round(d),
      });
      // Add to map pins (deduped).
      if (!pinMap.has(r.id)) {
        pinMap.set(r.id, {
          id: r.id,
          kind: "report",
          lat: r.latitude,
          lng: r.longitude,
          label: r.title,
          status: r.status,
          category: r.category,
          createdAt: r.createdAt.toISOString(),
        });
      }
    }

    for (const a of alerts) {
      const d = distanceToPolylineM(a.latitude, a.longitude, route.coordinates);
      if (d > CORRIDOR_M) continue;

      alertCount++;
      incidentCount++;
      if (a.status === "VERIFIED") verifiedCount++;

      const base = ALERT_WEIGHT[a.category] ?? 1.5;
      const statusMult = a.status === "VERIFIED" ? 1.5 : 1.0;
      const ageHours = Math.max(0, (now.getTime() - a.createdAt.getTime()) / HOUR_MS);
      const freshness = Math.max(0.5, 1 - (ageHours / 6) * 0.5);
      const confirmMult = Math.max(
        0.6,
        1 + Math.min(a.confirmCount, 5) * 0.1 - Math.min(a.disputeCount ?? 0, 5) * 0.08,
      );

      penalty += base * statusMult * freshness * confirmMult;
      hazards.push({
        id: a.id,
        kind: "alert",
        category: a.category,
        title: a.description.slice(0, 80),
        status: a.status,
        distanceM: Math.round(d),
      });
      // Add to map pins (deduped).
      if (!pinMap.has(a.id)) {
        pinMap.set(a.id, {
          id: a.id,
          kind: "alert",
          lat: a.latitude,
          lng: a.longitude,
          label: a.description.slice(0, 80),
          status: a.status,
          category: a.category,
          createdAt: a.createdAt.toISOString(),
        });
      }
    }

    hazards.sort((a, b) => a.distanceM - b.distanceM);
    const safetyScore = Math.max(0, Math.min(100, Math.round(100 - penalty * 6)));

    return {
      ...route,
      safetyScore,
      incidentCount,
      verifiedCount,
      alertCount,
      explanation: "",
      hazards: hazards.slice(0, 5),
    };
  });

  // Pick highest safetyScore (lowest risk); tie-break by shorter distance, then duration.
  const best = [...scored].sort(
    (a, b) => b.safetyScore - a.safetyScore || a.distanceM - b.distanceM || a.durationS - b.durationS,
  )[0];
  const recommendedRouteId = best?.id ?? scored[0]?.id ?? "";

  for (const r of scored) {
    if (r.id === recommendedRouteId) {
      r.explanation =
        r.incidentCount === 0
          ? "Recommended: no reported safety issues or active alerts within 200 m."
          : `Recommended: highest safety score (${r.safetyScore}/100) with ${r.incidentCount} nearby ${r.incidentCount === 1 ? "issue" : "issues"} (${r.verifiedCount} verified).`;
    } else {
      r.explanation =
        r.incidentCount === 0
          ? `Alternative (${r.safetyScore}/100): no nearby issues, longer travel time.`
          : `Alternative (${r.safetyScore}/100): ${r.incidentCount} nearby ${r.incidentCount === 1 ? "issue" : "issues"} (${r.verifiedCount} verified, ${r.alertCount} active alerts) within 200 m.`;
    }
  }

  return { routes: scored, recommendedRouteId, incidentPins: Array.from(pinMap.values()) };
}
