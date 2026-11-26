import type { Metadata } from "next";
import { ReportDetailView } from "@/components/saferoute/ReportDetailView";
import { getMeOrNull } from "@/lib/session";

export const metadata: Metadata = { title: "Report" };

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMeOrNull();
  return <ReportDetailView id={id} viewer={me ? { role: me.role } : null} />;
}
