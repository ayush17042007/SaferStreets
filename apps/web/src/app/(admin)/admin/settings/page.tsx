import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSettingsView } from "@/components/admin/AdminSettingsView";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Admin settings" };

export default async function Page() {
  const me = await requireMe();
  if (me.role !== "ADMIN") notFound();
  return <AdminSettingsView />;
}
