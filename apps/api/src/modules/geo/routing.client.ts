// Multi-alternative routing client (OpenRouteService or OSRM).
// Returns null when no routing provider is configured — never invents fake routes.

export interface RawRouteAlternative {
  id: string;
  summary: string;
  distanceM: number;
  durationS: number;
  coordinates: Array<[number, number]>; // [lng, lat]
}

export interface RoutingClient {
  readonly provider: string;
  getAlternatives(
    origin: { lat: number; lng: number },
    dest: { lat: number; lng: number },
  ): Promise<RawRouteAlternative[]>;
}

interface OrsGeoJson {
  features?: Array<{
    geometry?: { coordinates?: Array<[number, number]> };
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: Array<{ steps?: Array<{ name?: string }> }>;
    };
  }>;
}

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: Array<[number, number]> };
    legs?: Array<{ summary?: string }>;
  }>;
}

export function createRoutingClient(
  opts: { openRouteServiceKey?: string | undefined; osrmUrl?: string | undefined },
  fetchImpl: typeof fetch = fetch,
): RoutingClient | null {
  if (opts.openRouteServiceKey) {
  // Log presence of ORS key (without exposing it)
  console.info('OpenRouteService routing client initialized');
    const apiKey = opts.openRouteServiceKey;
    return {
      provider: "openrouteservice",
      async getAlternatives(origin, dest) {
        const res = await fetchImpl("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiKey,
          },
          body: JSON.stringify({
            coordinates: [
              [origin.lng, origin.lat],
              [dest.lng, dest.lat],
            ],
            alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.4 },
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          // Read response body for diagnostics (sanitized to first 200 chars)
          const errBody = await res.text();
          const snippet = errBody.length > 200 ? errBody.slice(0, 200) + "..." : errBody;
          console.warn("OpenRouteService error", { status: res.status, snippet });
          throw new Error(`OpenRouteService responded ${res.status}`);
        }
        const data = (await res.json()) as OrsGeoJson;
        const features = data.features ?? [];
        return features.flatMap((f, i) => {
          const coords = f.geometry?.coordinates;
          const dist = f.properties?.summary?.distance;
          const dur = f.properties?.summary?.duration;
          if (!coords || coords.length < 2 || dist === undefined || dur === undefined) return [];
          const roadNames = (f.properties?.segments?.[0]?.steps ?? [])
            .map((s) => s.name)
            .filter((n): n is string => Boolean(n && n !== "-"))
            .slice(0, 2);
          return [
            {
              id: `route-${i + 1}`,
              summary: roadNames.length > 0 ? `Via ${roadNames.join(" & ")}` : `Route ${i + 1}`,
              distanceM: Math.round(dist),
              durationS: Math.round(dur),
              coordinates: coords.map(([lng, lat]) => [lng, lat] as [number, number]),
            },
          ];
        });
      },
    };
  }

  if (opts.osrmUrl) {
    const base = opts.osrmUrl.replace(/\/+$/, "");
    return {
      provider: "osrm",
      async getAlternatives(origin, dest) {
        const url = `${base}/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?alternatives=true&overview=full&geometries=geojson`;
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
        const data = (await res.json()) as OsrmResponse;
        const routes = data.routes ?? [];
        return routes.flatMap((r, i) => {
          const coords = r.geometry?.coordinates;
          if (!coords || coords.length < 2 || r.distance === undefined || r.duration === undefined) return [];
          const legSummary = r.legs?.[0]?.summary;
          return [
            {
              id: `route-${i + 1}`,
              summary: legSummary ? `Via ${legSummary}` : `Route ${i + 1}`,
              distanceM: Math.round(r.distance),
              durationS: Math.round(r.duration),
              coordinates: coords.map(([lng, lat]) => [lng, lat] as [number, number]),
            },
          ];
        });
      },
    };
  }

  return null;
}
