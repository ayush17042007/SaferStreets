import { errors } from "../../lib/errors.js";
import type { Logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lru.js";
import type { SettingsService } from "../settings/settings.service.js";
import type { GeoClient, GeoPlace } from "./geo.client.js";

export const GEO_CACHE_MAX = 500;
export const GEO_CACHE_TTL_MS = 24 * 3600 * 1000;

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
    if (!deps.client) throw errors.serviceUnavailable("Place search isn't set up yet.");
    return deps.client;
  }

  return {
    async search(query: string): Promise<GeoPlace[]> {
      const client = requireClient();
      const key = query.trim().toLowerCase();
      const cached = searchCache.get(key);
      if (cached) return cached;
      const region = await deps.settings.get("serviceRegion");
      try {
        const found = await client.search(query.trim(), region);
        // Return all results from MapTiler — the API already biases results toward the
        // service region via bbox/proximity parameters. Filtering to inRegion here would
        // block SafeRoute destination searches for routes that start or end outside the
        // exact service bounding box, which is a common case.
        searchCache.set(key, found);
        return found;
      } catch (err) {
        deps.log.warn({ err }, "geocoding search failed");
        throw errors.serviceUnavailable("Place search isn't available right now. Drop a pin on the map instead.");
      }
    },

    async reverse(lat: number, lng: number): Promise<string | null> {
      const client = requireClient();
      // ~1 m precision is plenty for a cache key and avoids near-duplicate entries.
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
