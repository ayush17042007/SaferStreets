"use client";

import { DEFAULT_REGION, inRegion, type Region } from "@saferstreets/shared";
import type { Marker } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Icon, TextField } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { pickerPin } from "./markers";
import { useMap } from "./useMap";

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
}

interface Place {
  label: string;
  lat: number;
  lng: number;
}

const OUTSIDE = "That spot is outside the service area. Move the pin inside it.";

/** Fetches the service region (system settings). Falls back to the default box while loading or on error. */
export function usePublicRegion(): Region {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  useEffect(() => {
    let alive = true;
    api<{ data: Region }>("/public/region")
      .then((r) => alive && setRegion(r.data))
      .catch(() => {
        /* keep the default */
      });
    return () => {
      alive = false;
    };
  }, []);
  return region;
}

/**
 * Location picker (appendix-04 4.3): map with a draggable pin, place search, "Use my current location"
 * (only after a click), and an editable address filled by reverse geocoding. Pins outside the service
 * region are refused: onChange(null) is called and an error is shown.
 */
export function LocationPicker({
  value,
  onChange,
  region: regionProp,
  label = "Location",
}: {
  value: PickedLocation | null;
  onChange: (v: PickedLocation | null) => void;
  region?: Region;
  label?: string;
}) {
  const fetched = usePublicRegion();
  const region = regionProp ?? fetched;
  const box = useRef<HTMLDivElement>(null);
  const center: [number, number] = [(region.minLng + region.maxLng) / 2, (region.minLat + region.maxLat) / 2];
  const { map, failed } = useMap(box, {
    center,
    zoom: 11,
    fitBounds: [region.minLng, region.minLat, region.maxLng, region.maxLat],
  });

  const markerRef = useRef<Marker | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    value ? { lat: value.lat, lng: value.lng } : null,
  );
  const [address, setAddress] = useState(value?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fetchedResults, setResults] = useState<Place[]>([]);
  const [fetchedMsg, setSearchMsg] = useState<string | null>(null);
  // Short queries show nothing, without resetting state from an effect.
  const searching = query.trim().length >= 2;
  const results = searching ? fetchedResults : [];
  const searchMsg = searching ? fetchedMsg : null;
  const latest = useRef({ onChange, region });
  useEffect(() => {
    latest.current = { onChange, region };
  }, [onChange, region]);
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  /** Single entry point for any new pin position (map tap, drag, search result, device location). */
  const place = useCallback(async (lat: number, lng: number, knownAddress?: string) => {
    const { region: r, onChange: emit } = latest.current;
    setPin({ lat, lng });
    setNote(null);
    if (!inRegion({ lat, lng }, r)) {
      setError(OUTSIDE);
      emit(null);
      return;
    }
    setError(null);
    let addr = knownAddress ?? "";
    if (!addr) {
      try {
        const res = await api<{ data: { label: string | null } }>(
          `/geo/reverse?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`,
        );
        addr = res.data.label ?? "";
        if (!addr) setNote("We couldn't find an address for that spot. Type it in.");
      } catch (err) {
        setNote(
          err instanceof ApiError && err.status === 503
            ? "Address lookup isn't available. Type the address in."
            : "Type the address in.",
        );
        addr = addressRef.current;
      }
    }
    setAddress(addr.slice(0, 200));
    emit({ lat, lng, address: addr.slice(0, 200) });
  }, []);

  // Map: tap to place, draggable ink pin.
  useEffect(() => {
    if (!map) return;
    let alive = true;
    const onClick = (e: { lngLat: { lat: number; lng: number } }) => void place(e.lngLat.lat, e.lngLat.lng);
    map.on("click", onClick);
    (async () => {
      const { Marker: MarkerCtor } = await import("maplibre-gl");
      if (!alive) return;
      const m = new MarkerCtor({ element: pickerPin(), draggable: true });
      m.on("dragend", () => {
        const p = m.getLngLat();
        void place(p.lat, p.lng);
      });
      markerRef.current = m;
      if (pin) m.setLngLat([pin.lng, pin.lat]).addTo(map);
    })();
    return () => {
      alive = false;
      map.off("click", onClick);
      markerRef.current?.remove();
      markerRef.current = null;
    };
    // `pin` is only the initial value here; later changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, place]);

  useEffect(() => {
    const m = markerRef.current;
    if (!m || !map || !pin) return;
    m.setLngLat([pin.lng, pin.lat]);
    if (!m.getElement().isConnected) m.addTo(map);
  }, [pin, map]);

  // Debounced place search through our API proxy.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ data: Place[] }>(`/geo/search?q=${encodeURIComponent(q)}`);
        setResults(res.data);
        setSearchMsg(res.data.length === 0 ? "No places found inside the service area." : null);
      } catch (err) {
        setResults([]);
        setSearchMsg(
          err instanceof ApiError && err.status === 503
            ? "Place search isn't available. Tap the map to drop a pin."
            : err instanceof ApiError
              ? err.message
              : "Search failed. Tap the map to drop a pin.",
        );
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function pickResult(p: Place) {
    setQuery("");
    setResults([]);
    map?.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15) });
    void place(p.lat, p.lng, p.label);
  }

  function useMyLocation() {
    setNote(null);
    if (!("geolocation" in navigator)) {
      setNote("This browser can't share your location. Search or tap the map instead.");
      return;
    }
    // Only runs from this click: no permission prompt on page load.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map?.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
        void place(pos.coords.latitude, pos.coords.longitude);
      },
      () => setNote("Location is off or blocked. Search for the place or tap the map."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function editAddress(next: string) {
    setAddress(next);
    if (pin && inRegion(pin, region)) onChange({ lat: pin.lat, lng: pin.lng, address: next.slice(0, 200) });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="location-picker">
      <div className="relative">
        <TextField
          label={label}
          placeholder="Search for a place"
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="picker-results"
          leading={<Icon name="search" size={18} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 ? (
          <ul
            id="picker-results"
            role="listbox"
            className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-control border border-line bg-card shadow-popover"
          >
            {results.map((r) => (
              <li key={`${r.lat},${r.lng},${r.label}`} role="option" aria-selected="false">
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[14px] leading-5 hover:bg-neutral-bubble"
                >
                  <Icon name="saferoute" size={16} className="shrink-0 text-text-secondary" />
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {searchMsg ? <p className="text-[14px] leading-5 text-text-secondary">{searchMsg}</p> : null}

      <div>
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex min-h-11 items-center gap-2 text-[14px] leading-5 font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          <Icon name="location" size={18} />
          Use my current location
        </button>
      </div>

      {failed ? (
        <Banner tone="amber-warn" icon="alert" title="The map couldn't load">
          Search for the place above, or type the address below.
        </Banner>
      ) : (
        <div
          ref={box}
          role="application"
          aria-label="Map. Tap to drop a pin, drag the pin to adjust."
          data-testid="picker-map"
          className="relative h-[280px] w-full overflow-hidden rounded-map border border-line bg-cream"
        />
      )}

      {error ? (
        <p
          role="alert"
          data-testid="picker-error"
          className="flex items-start gap-1 text-[14px] leading-5 text-coral-text"
        >
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {note ? <p className="text-[14px] leading-5 text-text-secondary">{note}</p> : null}

      <TextField
        label="Address"
        optional
        maxLength={200}
        hint="Filled in from the pin. You can edit it."
        value={address}
        onChange={(e) => editAddress(e.target.value)}
        disabled={!pin || Boolean(error)}
      />
      {value ? (
        <p className="text-[12px] leading-4 text-text-secondary" data-testid="picker-value">
          Pin set at {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      ) : (
        <p className="text-[12px] leading-4 text-text-secondary">No pin yet. Search or tap the map.</p>
      )}
    </div>
  );
}
