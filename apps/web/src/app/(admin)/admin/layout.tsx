import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AppShell } from "@/components/shell/AppShell";
import { AppProviders } from "@/lib/providers";
import { currentPath, requireMe } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Admin group: signed in AND moderator or admin. Ordinary members get the 403 page. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  if (me.needsOnboarding && !(await currentPath()).startsWith("/welcome")) redirect("/welcome");
  if (me.role === "USER") redirect("/403");
  return (
    <AppProviders>
      <AppShell variant="admin" user={{ name: me.fullName ?? me.email, avatarUrl: me.avatarUrl }}>
        <div className="mx-auto flex max-w-5xl flex-col">
          <AdminNav role={me.role} />
          {children}
        </div>
      </AppShell>
    </AppProviders>
  );
}
