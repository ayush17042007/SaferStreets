import type { Metadata } from "next";
import { RidesBrowser } from "@/components/automate/RidesBrowser";
import { getMeOrNull } from "@/lib/session";

export const metadata: Metadata = { title: "AutoMate" };

export default async function AutomatePage() {
  const me = await getMeOrNull();
  return <RidesBrowser signedIn={me !== null} />;
}
