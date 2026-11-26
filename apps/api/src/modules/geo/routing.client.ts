// Multi-alternative routing client using OpenRouteService or OSRM.
// Coordinates are always [longitude, latitude].

export interface RawRouteAlternative {
  id: string;
  summary: string;
  distanceM: number;
  durationS: number;
  coordinates: Array<[number, number]>;
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
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
      segments?: Array<{
        steps?: Array<{ name?: string }>;
      }>;
    };
  }>;
}

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
    legs?: Array<{
      summary?: string;
    }>;
  }>;
}

const ORS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson";

const ROAD_SNAP_RADIUS_M = 2000;

// ORS hosted alternative-routing requests have a 100 km limit.
// Use a conservative 75 km straight-line threshold to avoid
// requesting alternatives for long inter-city journeys.
const ALTERNATIVE_DISTANCE_LIMIT_M = 75_000;

function straightLineDistanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (v: number) => (v * Math.PI) / 180;

  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseOrsRoutes(data: OrsGeoJson): RawRouteAlternative[] {
  return (data.features ?? []).flatMap((feature, i) => {
    const coords = feature.geometry?.coordinates;
    const distance = feature.properties?.summary?.distance;
    const duration = feature.properties?.summary?.duration;

    if (!coords || coords.length < 2 || distance === undefined || duration === undefined) {
      return [];
    }

    const roadNames = (feature.properties?.segments ?? [])
      .flatMap((segment) => segment.steps ?? [])
      .map((step) => step.name)
      .filter((name): name is string => Boolean(name && name !== "-"))
      .slice(0, 2);

    return [
      {
        id: `route-${i + 1}`,
        summary: roadNames.length > 0 ? `Via ${roadNames.join(" & ")}` : `Route ${i + 1}`,
        distanceM: Math.round(distance),
        durationS: Math.round(duration),
        coordinates: coords.map(([lng, lat]) => [lng, lat] as [number, number]),
      },
    ];
  });
}

export function createRoutingClient(
  opts: {
    openRouteServiceKey?: string;
    osrmUrl?: string;
  },
  fetchImpl: typeof fetch = fetch,
): RoutingClient | null {
  if (opts.openRouteServiceKey) {
    const apiKey = opts.openRouteServiceKey;

    async function requestOrs(
      origin: { lat: number; lng: number },
      dest: { lat: number; lng: number },
      useAlternatives: boolean,
    ): Promise<RawRouteAlternative[]> {
      const body: Record<string, unknown> = {
        coordinates: [
          [origin.lng, origin.lat],
          [dest.lng, dest.lat],
        ],

        // Allow city-centre coordinates to snap to a nearby
        // road, rather than failing at the default 350 metres.
        radiuses: [ROAD_SNAP_RADIUS_M, ROAD_SNAP_RADIUS_M],
      };

      if (useAlternatives) {
        body.alternative_routes = {
          target_count: 3,
          share_factor: 0.6,
          weight_factor: 1.4,
        };
      }

      const response = await fetchImpl(ORS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/geo+json",
          Authorization: apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        throw new Error(`OpenRouteService ${response.status}: ${errorBody.slice(0, 400)}`);
      }

      const data = (await response.json()) as OrsGeoJson;
      return parseOrsRoutes(data);
    }

    return {
      provider: "openrouteservice",

      async getAlternatives(origin, dest) {
        const directDistance = straightLineDistanceM(origin, dest);

        // Long inter-city journeys: request one real route.
        // Shorter journeys: request up to three alternatives.
        const useAlternatives = directDistance <= ALTERNATIVE_DISTANCE_LIMIT_M;

        if (!useAlternatives) {
          return requestOrs(origin, dest, false);
        }

        try {
          const alternatives = await requestOrs(origin, dest, true);

          // If the provider returns no alternatives, retry for
          // one normal route rather than returning a fake route.
          if (alternatives.length === 0) {
            return requestOrs(origin, dest, false);
          }

          return alternatives;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          // Some roads may produce a route-distance limit error
          // even when straight-line distance is below 75 km.
          if (/alternative|100\s?km|too long|maximum.*distance|distance.*limit/i.test(message)) {
            return requestOrs(origin, dest, false);
          }

          throw error;
        }
      },
    };
  }

  if (opts.osrmUrl) {
    const base = opts.osrmUrl.replace(/\/+$/, "");

    return {
      provider: "osrm",

      async getAlternatives(origin, dest) {
        const url =
          `${base}/route/v1/driving/` +
          `${origin.lng},${origin.lat};` +
          `${dest.lng},${dest.lat}` +
          "?alternatives=true&overview=full&geometries=geojson";

        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          throw new Error(`OSRM responded ${response.status}`);
        }

        const data = (await response.json()) as OsrmResponse;

        return (data.routes ?? []).flatMap((route, i) => {
          const coords = route.geometry?.coordinates;

          if (!coords || coords.length < 2 || route.distance === undefined || route.duration === undefined) {
            return [];
          }

          return [
            {
              id: `route-${i + 1}`,
              summary: route.legs?.[0]?.summary ? `Via ${route.legs[0].summary}` : `Route ${i + 1}`,
              distanceM: Math.round(route.distance),
              durationS: Math.round(route.duration),
              coordinates: coords.map(([lng, lat]) => [lng, lat] as [number, number]),
            },
          ];
        });
      },
    };
  }

  return null;
}
