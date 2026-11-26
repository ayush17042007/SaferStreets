import type { Metadata } from "next";
import { RideDetailView } from "@/components/automate/RideDetailView";
import { getMeOrNull } from "@/lib/session";

export const metadata: Metadata = { title: "Ride" };

export default async function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMeOrNull();
  return <RideDetailView id={id} viewerId={me?.id ?? null} />;
}
