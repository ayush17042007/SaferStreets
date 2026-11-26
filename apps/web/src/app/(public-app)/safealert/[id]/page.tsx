import type { Metadata } from "next";
import { AlertDetailView } from "@/components/safealert/AlertDetailView";
import { getMeOrNull } from "@/lib/session";

export const metadata: Metadata = { title: "Alert" };

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMeOrNull();
  return <AlertDetailView id={id} viewer={me ? { role: me.role } : null} />;
}
