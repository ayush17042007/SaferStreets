"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useMapKey } from "./MapKey";
import { buildMapStyle } from "./style";

export interface UseMapOptions {
  center: [number, number];
  zoom: number;
  /** Fit the view to [west, south, east, north] on creation instead of using center/zoom. */
  fitBounds?: [number, number, number, number];
}

/** Creates one MapLibre map in `container`. `failed` is true when WebGL or the library is unavailable. */
export function useMap(container: RefObject<HTMLDivElement | null>, opts: UseMapOptions) {
  const key = useMapKey();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const optsRef = useRef(opts);

  useEffect(() => {
    let instance: MapLibreMap | null = null;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const o = optsRef.current;
        const created = new maplibre.Map({
          container: container.current,
          style: buildMapStyle(key),
          center: o.center,
          zoom: o.zoom,
          ...(o.fitBounds ? { bounds: o.fitBounds, fitBoundsOptions: { padding: 0 } } : {}),
          attributionControl: { compact: true },
        });
        instance = created;
        created.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        created.on("load", () => !cancelled && setMap(created));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      instance?.remove();
      setMap(null);
    };
  }, [container, key]);

  return { map, failed, hasTiles: Boolean(key) };
}
