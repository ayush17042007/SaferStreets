"use client";

import type { IncidentMapPin, RouteAlternativeDto } from "@saferstreets/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Card, Icon, StatusChip, TextField, cn } from "@/components/ui";
import { lightColors } from "@/design/tokens";
import { ApiError, api } from "@/lib/api";
import { DRAFT_JOURNEY_KEY, compareRoutes, type DraftJourneyPayload } from "@/lib/saferoute";
import { MapView, type MapRoute } from "@/map/MapView";
import type { MapPoint } from "@/map/markers";

interface Place {
  label: string;
  lat: number;
  lng: number;
}

function PlaceSearchField({
  label,
  placeholder,
  value,
  onSelect,
  extraAction,
}: {
  label: string;
  placeholder: string;
  value: Place | null;
  onSelect: (p: Place | null) => void;
  extraAction?: React.ReactNode;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const [fetchedResults, setFetchedResults] = useState<Place[]>([]);
  const [fetchedError, setFetchedError] = useState<string | null>(null);

  const query = typed ?? value?.label ?? "";
  const searching = query.trim().length >= 2 && (!value || query.trim() !== value.label);

  const results = searching ? fetchedResults : [];
  const searchError = searching ? fetchedError : null;

  useEffect(() => {
    const q = query.trim();

    if (!searching) return;

    const timer = setTimeout(() => {
      api<{ data: Place[] }>(`/geo/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setFetchedResults(r.data);
          setFetchedError(r.data.length === 0 ? "No matching places found." : null);
        })
        .catch((err) => {
          setFetchedResults([]);

          if (err instanceof ApiError && err.status === 401) {
            setFetchedError("Log in to search places, or use your current location.");
          } else if (err instanceof ApiError) {
            setFetchedError(err.message);
          } else {
            setFetchedError("Place search is unavailable right now.");
          }
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searching]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <TextField
            label={label}
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setTyped(e.target.value);
              onSelect(null);
            }}
          />
        </div>

        {extraAction}
      </div>

      {searchError ? <p className="text-[12px] leading-4 text-text-secondary">{searchError}</p> : null}

      {results.length > 0 ? (
        <ul
          className="flex flex-col gap-1 rounded-control border border-line bg-card p-1"
          aria-label={`${label} results`}
        >
          {results.slice(0, 5).map((r) => (
            <li key={`${r.lat},${r.lng},${r.label}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setTyped(null);
                  setFetchedResults([]);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 py-1.5 text-left text-[13px] leading-5 hover:bg-neutral-chip"
              >
                <Icon name="saferoute" size={14} className="shrink-0 text-text-muted" />
                <span className="truncate">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function scoreTone(score: number): "mint" | "amber" | "coral" {
  if (score >= 70) return "mint";
  if (score >= 40) return "amber";
  return "coral";
}

function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));

  if (mins < 60) return `${mins} min`;

  const h = Math.floor(mins / 60);
  const m = mins % 60;

  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function formatDist(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function RouteComparer() {
  const router = useRouter();

  const [origin, setOrigin] = useState<Place | null>(null);
  const [dest, setDest] = useState<Place | null>(null);

  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [isLiveLocation, setIsLiveLocation] = useState(false);

  const gpsWatchId = useRef<number | null>(null);

  const [submitted, setSubmitted] = useState<{
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
  } | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  function stopLiveLocation(message?: string) {
    if (gpsWatchId.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchId.current);
      gpsWatchId.current = null;
    }

    setIsLiveLocation(false);

    if (message) {
      setGpsStatus(message);
    }
  }

  function useCurrentLocation() {
    // Clicking the button again stops live GPS tracking.
    if (gpsWatchId.current !== null) {
      stopLiveLocation("Live location stopped.");
      return;
    }

    if (!("geolocation" in navigator)) {
      setGpsStatus("This browser does not support location.");
      return;
    }

    setGpsStatus("Waiting for your current GPS location...");
    setIsLiveLocation(true);

    gpsWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy);

        // Update the origin whenever the browser receives a new GPS position.
        setOrigin({
          label: `Live location (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          lat,
          lng,
        });

        setGpsStatus(`Live location active · accuracy approximately ${accuracy} m`);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          stopLiveLocation("Location permission denied. Allow location access in your browser settings.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          stopLiveLocation("Your device could not determine your location. Check GPS/location services.");
        } else {
          stopLiveLocation("GPS timed out. Keep the page open and try again.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );
  }

  // Stop the GPS watcher when the component unmounts.
  useEffect(() => {
    return () => {
      if (gpsWatchId.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchId.current);
      }
    };
  }, []);

  const routesQuery = useQuery({
    queryKey: ["saferoute", submitted],
    queryFn: () => compareRoutes(submitted!),
    enabled: Boolean(submitted),
    retry: false,
  });

  const result = routesQuery.data ?? null;
  const loading = routesQuery.isFetching;

  const error =
    validationError ??
    (routesQuery.isError
      ? routesQuery.error instanceof ApiError
        ? routesQuery.error.message
        : "We could not compare routes right now. Try again."
      : null);

  useEffect(() => {
    if (result?.recommendedRouteId) {
      setSelectedRouteId((prev) =>
        prev && result.routes.some((r) => r.id === prev) ? prev : result.recommendedRouteId,
      );
    }
  }, [result]);

  async function findRoutes() {
    if (!origin || !dest) {
      setValidationError("Choose both a starting point and a destination.");
      return;
    }

    setValidationError(null);
    setSelectedPinId(null);

    const next = {
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
    };

    const same =
      submitted &&
      submitted.originLat === next.originLat &&
      submitted.originLng === next.originLng &&
      submitted.destLat === next.destLat &&
      submitted.destLng === next.destLng;

    setSubmitted(next);

    if (same) {
      await routesQuery.refetch();
    }
  }

  function startJourneyWithRoute(route: RouteAlternativeDto) {
    if (!dest) return;

    const draft: DraftJourneyPayload = {
      destinationText: dest.label,
      destLat: dest.lat,
      destLng: dest.lng,
      ...(origin
        ? {
            startText: origin.label,
            startLat: origin.lat,
            startLng: origin.lng,
          }
        : {}),
      routeGeometry: route.coordinates,
    };

    try {
      sessionStorage.setItem(DRAFT_JOURNEY_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage may be unavailable.
    }

    router.push("/journeyguard/new");
  }

  const mapRoutes = useMemo<MapRoute[]>(() => {
    if (!result) return [];

    return result.routes.map((r) => {
      const isSelected = r.id === selectedRouteId;
      const isRec = r.id === result.recommendedRouteId;

      return {
        id: r.id,
        coordinates: r.coordinates,
        color: isSelected ? (isRec ? lightColors.mint : lightColors.ink) : lightColors["text-muted"],
        selected: isSelected,
      };
    });
  }, [result, selectedRouteId]);

  const mapPoints = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [];

    if (origin) {
      pts.push({
        id: "origin",
        kind: "live",
        lat: origin.lat,
        lng: origin.lng,
        label: origin.label,
      });
    }

    if (dest) {
      pts.push({
        id: "dest",
        kind: "ride",
        lat: dest.lat,
        lng: dest.lng,
        label: dest.label,
      });
    }

    // Show incident pins returned by the route-scoring response.
    if (result?.incidentPins) {
      for (const p of result.incidentPins) {
        pts.push({
          id: p.id,
          kind: p.kind === "alert" ? "alert" : "report",
          lat: p.lat,
          lng: p.lng,
          label: p.label,
        });
      }
    }

    return pts;
  }, [origin, dest, result]);

  const activeRoute = result?.routes.find((r) => r.id === selectedRouteId) ?? result?.routes[0] ?? null;

  const selectedPin: IncidentMapPin | null = result?.incidentPins.find((p) => p.id === selectedPinId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3">Compare route safety</h2>
          <p className="text-[14px] leading-5 text-text-secondary">
            Compares available routes against verified &amp; community safety reports and active alerts within 200 m.
          </p>
        </div>

        <PlaceSearchField
          label="Starting from"
          placeholder="Search starting point or use GPS"
          value={origin}
          onSelect={setOrigin}
          extraAction={
            <Button type="button" variant="secondary" size="mobile" onClick={useCurrentLocation}>
              {isLiveLocation ? "Stop live location" : "Use live location"}
            </Button>
          }
        />

        {gpsStatus ? <p className="text-[12px] leading-4 text-text-secondary">{gpsStatus}</p> : null}

        <PlaceSearchField label="Destination" placeholder="Where are you going?" value={dest} onSelect={setDest} />

        {error ? (
          <Banner tone="coral" icon="error">
            {error}
          </Banner>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" loading={loading} onClick={() => void findRoutes()} disabled={!origin || !dest}>
            Find safest route
          </Button>

          <span className="text-[12px] leading-4 text-text-secondary">
            Scores reflect community &amp; verified reports on SaferStreets, not guaranteed road conditions.
          </span>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {result ? (
            <>
              {result.routes.every((r) => r.incidentCount === 0) ? (
                <Banner tone="neutral" icon="alert">
                  No safety reports or active alerts are recorded within 200 m of these routes. This reflects limited
                  data, not a guarantee that the route is hazard-free.
                </Banner>
              ) : null}

              <ul className="flex flex-col gap-3" aria-label="Route alternatives">
                {result.routes.map((r) => {
                  const isRec = r.id === result.recommendedRouteId;
                  const isSel = r.id === selectedRouteId;

                  return (
                    <li key={r.id}>
                      <Card
                        className={cn(
                          "flex flex-col gap-3 transition-colors",
                          isSel ? "border-ink ring-1 ring-ink" : "hover:border-line-control",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{r.summary}</span>

                            {isRec ? <StatusChip tone="mint" label="Recommended" icon="check" /> : null}
                          </div>

                          <StatusChip tone={scoreTone(r.safetyScore)} label={`Safety ${r.safetyScore}/100`} />
                        </div>

                        <div className="flex flex-wrap gap-3 text-[13px] leading-5 text-text-secondary">
                          <span>{formatDist(r.distanceM)}</span>
                          <span>·</span>
                          <span>{formatDuration(r.durationS)}</span>
                          <span>·</span>
                          <span>
                            {r.incidentCount} nearby {r.incidentCount === 1 ? "issue" : "issues"}
                          </span>
                        </div>

                        <p className="text-[13px] leading-5 text-ink">{r.explanation}</p>

                        {r.hazards.length > 0 ? (
                          <ul className="flex flex-col gap-1 border-t border-line pt-2 text-[12px] leading-4 text-text-secondary">
                            {r.hazards.map((h) => (
                              <li key={h.id} className="flex items-center justify-between gap-2">
                                <span className="truncate">
                                  {h.kind === "alert" ? "Alert: " : ""}
                                  {h.title}
                                </span>
                                <span className="shrink-0">{h.distanceM} m</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            size="mobile"
                            variant={isSel ? "ink" : "secondary"}
                            onClick={() => setSelectedRouteId(r.id)}
                          >
                            {isSel ? "Selected" : "Preview on map"}
                          </Button>

                          <Button type="button" size="mobile" variant="amber" onClick={() => startJourneyWithRoute(r)}>
                            Start protected journey
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <Card className="flex flex-col gap-2">
              <p className="font-semibold">How SafeRoute scoring works</p>
              <p className="text-[14px] leading-5 text-text-secondary">
                Each route alternative is checked segment-by-segment against non-rejected reports and active alerts
                within 200 metres, weighted by severity, verification status, community confirmations, and freshness.
              </p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3 md:sticky md:top-20 md:self-start">
          <MapView
            points={mapPoints}
            routes={mapRoutes}
            selectedId={selectedPinId}
            onSelect={setSelectedPinId}
            label={activeRoute ? `Map showing ${activeRoute.summary}` : "Route comparison map"}
          />

          {selectedPin ? (
            <Card className="flex flex-col gap-2" aria-label="Selected incident details">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusChip
                    tone={selectedPin.kind === "alert" ? "coral" : "amber"}
                    label={selectedPin.kind === "alert" ? "SafeAlert" : "Safety Report"}
                  />

                  <StatusChip tone="neutral" label={selectedPin.status.replace(/_/g, " ")} />
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPinId(null)}
                  className="text-[12px] font-medium text-text-secondary hover:text-ink"
                >
                  Close
                </button>
              </div>

              <p className="text-[14px] font-semibold text-ink">{selectedPin.category.replace(/_/g, " ")}</p>

              <p className="text-[13px] leading-5 text-ink">{selectedPin.label}</p>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-secondary">
                <span>
                  {selectedPin.lat.toFixed(4)}, {selectedPin.lng.toFixed(4)}
                  {selectedPin.createdAt ? ` · ${new Date(selectedPin.createdAt).toLocaleString("en-IN")}` : ""}
                </span>

                <Link
                  href={
                    selectedPin.kind === "alert"
                      ? `/safealert/${selectedPin.id}`
                      : `/saferoute/reports/${selectedPin.id}`
                  }
                  className="font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
                >
                  View details
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
