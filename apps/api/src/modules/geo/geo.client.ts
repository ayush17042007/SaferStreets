// Geocoding through MapTiler. The browser never receives the API key.
import type { Region } from "@saferstreets/shared";

export interface GeoPlace {
  label: string;
  lat: number;
  lng: number;
}

export interface GeoClient {
  search(query: string, region: Region): Promise<GeoPlace[]>;
  reverse(lat: number, lng: number): Promise<string | null>;
}

const BASE = "https://api.maptiler.com/geocoding";

interface MapTilerFeature {
  properties?: {
    place?: string;
    place_name?: string;
    text?: string;
    center?: [number, number];
  };
  geometry?: {
    coordinates?: [number, number];
  };

  // Legacy response compatibility
  place_name?: string;
  text?: string;
  center?: [number, number];
}

interface MapTilerResponse {
  features?: MapTilerFeature[];
}

function getLabel(feature: MapTilerFeature): string | null {
  return (
    feature.properties?.place ??
    feature.properties?.place_name ??
    feature.place_name ??
    feature.properties?.text ??
    feature.text ??
    null
  );
}

function getCoordinates(feature: MapTilerFeature): [number, number] | null {
  const coordinates = feature.geometry?.coordinates ?? feature.properties?.center ?? feature.center;

  if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
    return null;
  }

  const [lng, lat] = coordinates;

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null;
  }

  return [lng, lat];
}

export function createMapTilerClient(key: string | undefined, fetchImpl: typeof fetch = fetch): GeoClient | null {
  if (!key) return null;

  const mapTilerKey = key;

  async function call(path: string, params: Record<string, string>): Promise<MapTilerFeature[]> {
    const url = new URL(`${BASE}/${path}.json`);

    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    if (!key) {
      throw new Error("MAPTILER_KEY is not configured on the API server.");
    }

    url.searchParams.set("key", mapTilerKey);

    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`MapTiler geocoding responded ${res.status}`);
    }

    const body = (await res.json()) as MapTilerResponse;

    return Array.isArray(body.features) ? body.features : [];
  }

  return {
    async search(query, region) {
      const normalized = query.trim();

      if (normalized.length < 2) return [];

      const features = await call(encodeURIComponent(normalized), {
        limit: "10",
        language: "en",
        country: "in",
        types: "poi,address,place,locality,neighbourhood",
        autocomplete: "true",

        // Ranking hint, not a restrictive geographic boundary.
        proximity: `${(region.minLng + region.maxLng) / 2},${(region.minLat + region.maxLat) / 2}`,
      });

      const seen = new Set<string>();

      return features.flatMap((feature) => {
        const label = getLabel(feature);
        const coordinates = getCoordinates(feature);

        if (!label || !coordinates) return [];

        const [lng, lat] = coordinates;

        const uniqueKey = `${lat.toFixed(6)},${lng.toFixed(6)},${label.toLowerCase()}`;

        if (seen.has(uniqueKey)) return [];

        seen.add(uniqueKey);

        return [{ label, lat, lng }];
      });
    },

    async reverse(lat, lng) {
      const features = await call(`${lng},${lat}`, {
        limit: "1",
        language: "en",
      });

      return features[0] ? getLabel(features[0]) : null;
    },
  };
}
