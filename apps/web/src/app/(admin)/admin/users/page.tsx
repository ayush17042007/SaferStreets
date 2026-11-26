import type { Metadata } from "next";
import { UsersView } from "@/components/admin/UsersView";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Users" };

export default async function Page() {
  const me = await requireMe();
  return <UsersView isAdmin={me.role === "ADMIN"} />;
}
