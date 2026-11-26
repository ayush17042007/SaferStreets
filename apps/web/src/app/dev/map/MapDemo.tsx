"use client";

import { useState } from "react";
import { AppProviders } from "@/lib/providers";
import { LocationPicker, type PickedLocation } from "@/map/LocationPicker";
import { MapView } from "@/map/MapView";
import type { MapPoint } from "@/map/markers";
import { Banner, Card } from "@/components/ui";

/** DEV POINTS: fixed sample positions around the default region, only to exercise the components. */
const DEV_POINTS: MapPoint[] = [
  { id: "r1", kind: "report", lat: 25.1425, lng: 75.834, label: "Streetlight out near Gate 2" },
  { id: "r2", kind: "report", lat: 25.1427, lng: 75.8343, label: "Pothole on Main Road" },
  { id: "r3", kind: "report", lat: 25.1429, lng: 75.8338, label: "Dark footpath by the hostel" },
  { id: "a1", kind: "alert", lat: 25.15, lng: 75.84, label: "Road accident at Station Rd crossing" },
  { id: "d1", kind: "ride", lat: 25.16, lng: 75.86, label: "Campus to Bus Stand, 8:15 pm" },
  { id: "d2", kind: "ride", lat: 25.17, lng: 75.872, label: "Hostel Gate to Railway Station, 6:30 pm" },
];

export function MapDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  return (
    <AppProviders>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-8">
        <h1 className="type-h1">Map components</h1>
        <Banner tone="amber-warn" title="Dev page">
          Fixed dev points around the default service area. Without a MapTiler key the map shows the cream background
          only.
        </Banner>
        <section aria-labelledby="mv" className="flex flex-col gap-3">
          <h2 id="mv" className="type-h2">
            MapView
          </h2>
          <MapView points={DEV_POINTS} selectedId={selected} onSelect={setSelected} />
          <p data-testid="selected" className="text-[14px] leading-5 text-text-secondary">
            Selected: {selected ?? "none"}
          </p>
        </section>
        <section aria-labelledby="lp" className="flex max-w-xl flex-col gap-3">
          <h2 id="lp" className="type-h2">
            LocationPicker
          </h2>
          <Card>
            <LocationPicker value={picked} onChange={setPicked} />
          </Card>
          <p data-testid="picked-json" className="text-[12px] leading-4 text-text-secondary">
            {picked ? JSON.stringify(picked) : "null"}
          </p>
        </section>
      </main>
    </AppProviders>
  );
}
