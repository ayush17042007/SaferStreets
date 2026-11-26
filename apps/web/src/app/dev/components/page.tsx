import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

export const metadata = { title: "Components · SaferStreets dev" };

/** Dev-only gallery: 404 in production builds. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
