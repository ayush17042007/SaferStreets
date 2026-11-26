import { errors } from "../../lib/errors.js";
import type { Logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lru.js";
import type { SettingsService } from "../settings/settings.service.js";
import type { GeoClient, GeoPlace } from "./geo.client.js";

export const GEO_CACHE_MAX = 500;
export const GEO_CACHE_TTL_MS = 24 * 3600 * 1000;

// Official IIIT Kota permanent campus, Ranpur, Kota.
// Coordinates are the approximate centre of the campus site.
const IIIT_KOTA: GeoPlace = {
  label: "IIIT Kota Permanent Campus, Ranpur, Kota, Rajasthan, India",
  lat: 25.049025,
  lng: 75.829497,
};

function isIIITKotaQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

  return (
    normalized.includes("iiit kota") ||
    normalized.includes("iiitkota") ||
    normalized.includes("indian institute of information technology kota")
  );
}

/** Search and reverse geocoding behind our own API: cached, rate limited, region aware. */
export function createGeoService(deps: {
  client: GeoClient | null;
  settings: SettingsService;
  log: Logger;
  now?: () => number;
}) {
  const searchCache = new LruCache<GeoPlace[]>(GEO_CACHE_MAX, GEO_CACHE_TTL_MS, deps.now);

  const reverseCache = new LruCache<string | null>(GEO_CACHE_MAX, GEO_CACHE_TTL_MS, deps.now);

  function requireClient(): GeoClient {
    if (!deps.client) {
      throw errors.serviceUnavailable("Place search isn't set up yet.");
    }

    return deps.client;
  }

  return {
    async search(query: string): Promise<GeoPlace[]> {
      const trimmed = query.trim();

      // Always return the known campus result, even if MapTiler
      // does not have IIIT Kota in its geocoding database.
      if (isIIITKotaQuery(trimmed)) {
        return [IIIT_KOTA];
      }

      const client = requireClient();
      const key = trimmed.toLowerCase();

      const cached = searchCache.get(key);
      if (cached) return cached;

      const region = await deps.settings.get("serviceRegion");

      try {
        const found = await client.search(trimmed, region);

        searchCache.set(key, found);
        return found;
      } catch (err) {
        deps.log.warn({ err }, "geocoding search failed");

        throw errors.serviceUnavailable("Place search isn't available right now. Drop a pin on the map instead.");
      }
    },

    async reverse(lat: number, lng: number): Promise<string | null> {
      const client = requireClient();

      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

      const cached = reverseCache.get(key);
      if (cached !== undefined) return cached;

      try {
        const label = await client.reverse(lat, lng);

        reverseCache.set(key, label);
        return label;
      } catch (err) {
        deps.log.warn({ err }, "reverse geocoding failed");

        throw errors.serviceUnavailable("We couldn't look up that address. Type it in instead.");
      }
    },
  };
}

export type GeoService = ReturnType<typeof createGeoService>;
