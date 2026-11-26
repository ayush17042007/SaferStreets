"use client";

import type { Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import { Banner, Button, Icon, cn } from "@/components/ui";
import { clusterMarker, pointMarker, type MapPoint } from "./markers";
import { useMap } from "./useMap";

export interface MapRoute {
  id: string;
  coordinates: Array<[number, number]>;
  color: string;
  selected?: boolean;
}

export interface MapViewProps {
  points: MapPoint[];
  routes?: MapRoute[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** Accessible name for the map region. */
  label?: string;
}

/**
 * MapLibre map with clustered markers (A4). Always has a list alternative, and falls back to the list
 * alone when the map cannot start (no WebGL, script blocked).
 */
export function MapView({
  points,
  routes,
  selectedId = null,
  onSelect,
  center = [75.85, 25.15],
  zoom = 12,
  className,
  label = "Map of nearby items",
}: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const { map, failed } = useMap(box, { center, zoom });
  const [showList, setShowList] = useState(false);
  const markers = useRef<Marker[]>([]);

  const index = useMemo(() => {
    const sc = new Supercluster<{ point: MapPoint }>({ radius: 56, maxZoom: 16 });
    sc.load(
      points.map((p) => ({
        type: "Feature",
        properties: { point: p },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    );
    return sc;
  }, [points]);

  useEffect(() => {
    if (!map) return;
    let alive = true;
    const draw = async () => {
      const { Marker: MarkerCtor } = await import("maplibre-gl");
      if (!alive) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const b = map.getBounds();
      const items = index.getClusters(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        Math.round(map.getZoom()),
      );
      for (const f of items) {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const props = f.properties as {
          cluster?: boolean;
          point_count?: number;
          cluster_id?: number;
          point?: MapPoint;
        };
        let node: HTMLElement;
        if (props.cluster) {
          const id = props.cluster_id as number;
          node = clusterMarker(props.point_count ?? 0, () => {
            map.easeTo({ center: [lng, lat], zoom: Math.min(index.getClusterExpansionZoom(id), 18) });
          });
        } else {
          const p = props.point as MapPoint;
          node = pointMarker(p, p.id === selectedId, (pid) => onSelect?.(pid));
        }
        markers.current.push(new MarkerCtor({ element: node }).setLngLat([lng, lat]).addTo(map));
      }
    };
    void draw();
    map.on("moveend", draw);
    return () => {
      alive = false;
      map.off("moveend", draw);
      markers.current.forEach((m) => m.remove());
      markers.current = [];
    };
  }, [map, index, selectedId, onSelect]);

  useEffect(() => {
    if (!map) return;
    const srcId = "saferstreets-routes";
    const layerId = "saferstreets-routes-line";
    const apply = () => {
      const features = (routes ?? [])
        .filter((r) => r.coordinates.length >= 2)
        .map((r) => ({
          type: "Feature" as const,
          properties: { id: r.id, color: r.color, width: r.selected ? 6 : 3.5, opacity: r.selected ? 0.95 : 0.55 },
          geometry: { type: "LineString" as const, coordinates: r.coordinates },
        }));
      const data = { type: "FeatureCollection" as const, features };
      const existing = map.getSource(srcId) as { setData?: (d: unknown) => void } | undefined;
      if (existing?.setData) {
        existing.setData(data);
      } else {
        map.addSource(srcId, { type: "geojson", data });
        map.addLayer({
          id: layerId,
          type: "line",
          source: srcId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "width"],
            "line-opacity": ["get", "opacity"],
          },
        });
      }
      const allCoords = features.flatMap((f) => f.geometry.coordinates);
      if (allCoords.length >= 2) {
        const lngs = allCoords.map((c) => c[0]);
        const lats = allCoords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 48, maxZoom: 15, duration: 400 },
        );
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [map, routes]);

  const listOnly = failed;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {listOnly ? (
        <Banner tone="amber-warn" icon="alert" title="The map couldn't load">
          Here is the list instead. You can still open any item.
        </Banner>
      ) : (
        <div
          ref={box}
          role="region"
          aria-label={label}
          data-testid="map-canvas"
          className="relative h-[360px] w-full overflow-hidden rounded-map border border-line bg-cream"
        />
      )}
      {!listOnly ? (
        <div className="flex justify-end">
          <Button variant="secondary" size="mobile" aria-pressed={showList} onClick={() => setShowList((s) => !s)}>
            <Icon name={showList ? "saferoute" : "inbox"} size={16} />
            {showList ? "Hide list" : "Show as list"}
          </Button>
        </div>
      ) : null}
      {listOnly || showList ? <PointList points={points} selectedId={selectedId} onSelect={onSelect} /> : null}
    </div>
  );
}

const KIND_TEXT = { report: "Report", alert: "Alert", ride: "Ride", live: "Live location" } as const;

/** The list alternative: same items, keyboard and screen-reader friendly. */
export function PointList({
  points,
  selectedId,
  onSelect,
}: {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: ((id: string) => void) | undefined;
}) {
  if (points.length === 0)
    return <p className="text-[14px] leading-5 text-text-secondary">Nothing to show here yet.</p>;
  return (
    <ul aria-label="Items on the map" className="flex flex-col gap-2">
      {points.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            aria-pressed={p.id === selectedId}
            onClick={() => onSelect?.(p.id)}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-3 rounded-control border bg-card px-3 text-left text-[14px] leading-5",
              p.id === selectedId ? "border-ink" : "border-line hover:border-line-control",
            )}
          >
            <span className="font-medium">{p.label}</span>
            <span className="text-[12px] leading-4 text-text-secondary">{KIND_TEXT[p.kind]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
