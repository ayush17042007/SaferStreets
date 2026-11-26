import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AppProviders } from "@/lib/providers";
import { currentPath, requireMe } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Auth-gated group. The proxy already turned away visitors without a cookie; here the session is
 * validated through GET /me (revoked, expired and suspended all fail) and new users go to /welcome.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  if (me.needsOnboarding && !(await currentPath()).startsWith("/welcome")) redirect("/welcome");
  return (
    <AppProviders>
      <AppShell user={{ name: me.fullName ?? me.email, avatarUrl: me.avatarUrl }} staff={me.role !== "USER"}>
        {children}
      </AppShell>
    </AppProviders>
  );
}
