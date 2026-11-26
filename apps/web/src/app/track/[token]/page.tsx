import type { Metadata } from "next";
import { TrackView } from "@/components/journeyguard/TrackView";

export const metadata: Metadata = {
  title: "Journey status",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TrackView token={token} />;
}
