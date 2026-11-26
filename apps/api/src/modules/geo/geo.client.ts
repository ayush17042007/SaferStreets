// Geocoding through MapTiler (Part B9). The browser never sees the key: it calls our proxy.
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

interface Feature {
  place_name?: string;
  center?: [number, number];
}

export function createMapTilerClient(key: string | undefined, fetchImpl: typeof fetch = fetch): GeoClient | null {
  if (!key) return null;

  async function call(path: string, params: Record<string, string>): Promise<Feature[]> {
    const url = new URL(`${BASE}/${path}.json`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", key as string);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`MapTiler geocoding responded ${res.status}`);
    const body = (await res.json()) as { features?: Feature[] };
    return body.features ?? [];
  }

  return {
    async search(query, region) {
      const features = await call(encodeURIComponent(query), {
        limit: "5",
        language: "en",
        country: "in",
        // Use proximity to bias results toward the service area centre, but do not apply a
        // strict bbox filter: SafeRoute users may need to search destinations anywhere in India,
        // not just inside the configured service bounding box.
        proximity: `${(region.minLng + region.maxLng) / 2},${(region.minLat + region.maxLat) / 2}`,
      });
      return features.flatMap((f) =>
        f.place_name && f.center ? [{ label: f.place_name, lng: f.center[0], lat: f.center[1] }] : [],
      );
    },
    async reverse(lat, lng) {
      const features = await call(`${lng},${lat}`, { limit: "1", language: "en" });
      return features[0]?.place_name ?? null;
    },
  };
}
