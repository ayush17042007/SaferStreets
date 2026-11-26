import type { Metadata } from "next";
import { SafeRouteView } from "@/components/saferoute/SafeRouteView";

export const metadata: Metadata = { title: "SafeRoute" };

export default function SafeRoutePage() {
  return <SafeRouteView />;
}
