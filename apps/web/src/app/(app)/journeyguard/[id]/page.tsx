import { JourneyDetail } from "@/components/journeyguard/JourneyDetail";

export const metadata = { title: "Journey" };

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JourneyDetail id={id} />;
}
