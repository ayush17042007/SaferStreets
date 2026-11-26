import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuditView } from "@/components/admin/AuditView";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function Page() {
  const me = await requireMe();
  if (me.role !== "ADMIN") notFound();
  return <AuditView />;
}
