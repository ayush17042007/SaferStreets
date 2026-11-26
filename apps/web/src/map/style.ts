// Custom light MapTiler style (A4): cream land, white roads with soft casings, soft green parks,
// muted water, no label clutter. Colours come from the design tokens; this module IS the versioned
// style (JSON-serialisable). Without a MapTiler key the style is just the cream background, so pins and
// the location picker still work and the app never shows a broken tile layer.
import type { StyleSpecification } from "maplibre-gl";
import { lightColors } from "@/design/tokens";

export const MAP_STYLE_VERSION = 1;

export function buildMapStyle(key?: string): StyleSpecification {
  const c = lightColors;
  const background = { id: "land", type: "background", paint: { "background-color": c.cream } } as const;
  if (!key) return { version: 8, name: "saferstreets-light-v1-no-tiles", sources: {}, layers: [background] };

  const roadWidth = (base: number) =>
    ["interpolate", ["exponential", 1.5], ["zoom"], 10, base * 0.4, 14, base, 18, base * 4] as never;
  const road = (id: string, filter: unknown[], width: number): StyleSpecification["layers"] => [
    {
      id: `${id}-casing`,
      type: "line",
      source: "tiles",
      "source-layer": "transportation",
      filter: filter as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c["map-road-casing"], "line-width": roadWidth(width + 1.5) },
    },
    {
      id: id,
      type: "line",
      source: "tiles",
      "source-layer": "transportation",
      filter: filter as never,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.white, "line-width": roadWidth(width) },
    },
  ];

  return {
    version: 8,
    name: "saferstreets-light-v1",
    sources: { tiles: { type: "vector", url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}` } },
    layers: [
      background,
      {
        id: "parks",
        type: "fill",
        source: "tiles",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["park", "cemetery", "grass", "pitch"]]] as never,
        paint: { "fill-color": c["map-park"] },
      },
      { id: "water", type: "fill", source: "tiles", "source-layer": "water", paint: { "fill-color": c["map-water"] } },
      ...road("road-minor", ["in", ["get", "class"], ["literal", ["minor", "service", "track", "path"]]], 1.5),
      ...road(
        "road-main",
        ["in", ["get", "class"], ["literal", ["tertiary", "secondary", "primary", "trunk", "motorway"]]],
        3,
      ),
    ],
  };
}
