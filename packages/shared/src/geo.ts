// Geo helpers shared by the API and the web app (appendix-06 6.4, appendix-09 location privacy).
// No PostGIS: bounding-box prefilter on lat/lng indexes, then Haversine distance.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Region {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEG_LAT = 111.32;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/** Box that contains every point within `radiusKm` of the centre (cheap index prefilter before Haversine). */
export function bboxAround(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cos = Math.max(0.01, Math.cos(rad(center.lat)));
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

export function inBBox(p: LatLng, box: BBox): boolean {
  return p.lat >= box.minLat && p.lat <= box.maxLat && p.lng >= box.minLng && p.lng <= box.maxLng;
}

/** True when the point lies inside the service region (bounds inclusive). */
export function inRegion(p: LatLng, region: Region): boolean {
  return inBBox(p, region);
}

/**
 * Snaps a point to a grid of roughly `meters` (default 500 m) so guests never see exact coordinates
 * (appendix-02 2D). Rounds to the grid cell centre, so the output is stable for nearby inputs.
 */
export function roundToMeters(p: LatLng, meters = 500): LatLng {
  const stepLat = meters / 1000 / KM_PER_DEG_LAT;
  const cell = (v: number, step: number) => (Math.floor(v / step) + 0.5) * step;
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const lat = cell(p.lat, stepLat);
  // The longitude step uses the cell-centre latitude (not the raw input), so every point in a cell
  // lands on the same output and re-rounding an output returns it unchanged.
  const stepLng = meters / 1000 / (KM_PER_DEG_LAT * Math.max(0.01, Math.cos(rad(lat))));
  return { lat: round6(lat), lng: round6(cell(p.lng, stepLng)) };
}

/** Human distance for cards: "40 m", "0.6 km", "12 km". */
export function formatDistance(km: number): string {
  if (km < 0.1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Default service region (Kota area, P5); admins can change it in system settings. */
export const DEFAULT_REGION: Region = { minLat: 24.9, maxLat: 25.4, minLng: 75.6, maxLng: 76.1 };
