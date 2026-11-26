import { notFound } from "next/navigation";
import { MapDemo } from "./MapDemo";

export const metadata = { title: "Map · SaferStreets dev", robots: { index: false } };

/** Dev-only: MapView and LocationPicker with clearly labelled dev points. 404 in production. */
export default function DevMapPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MapDemo />;
}
