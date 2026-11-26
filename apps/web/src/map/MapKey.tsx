"use client";

import { createContext, useContext, type ReactNode } from "react";

/** MapTiler key for tiles. It is a public, origin-restricted key (Part B9); geocoding goes through our API. */
const MapKeyContext = createContext<string | undefined>(undefined);

export function MapKeyProvider({ value, children }: { value: string | undefined; children: ReactNode }) {
  return <MapKeyContext.Provider value={value}>{children}</MapKeyContext.Provider>;
}

export function useMapKey(): string | undefined {
  return useContext(MapKeyContext);
}
