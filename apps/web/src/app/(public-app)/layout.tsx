import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { AppShell } from "@/components/shell/AppShell";
import { AppProviders } from "@/lib/providers";
import { getMeOrNull } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Pages guests may read (SafeRoute list and report detail). Signed-in visitors get the full app shell;
 * guests get a plain header with Log in / Get started and are never redirected.
 */
export default async function PublicAppLayout({ children }: { children: ReactNode }) {
  const me = await getMeOrNull();
  if (me) {
    if (me.needsOnboarding) redirect("/welcome");
    return (
      <AppProviders>
        <AppShell user={{ name: me.fullName ?? me.email, avatarUrl: me.avatarUrl }}>{children}</AppShell>
      </AppProviders>
    );
  }
  return (
    <AppProviders>
      <div className="min-h-screen bg-cream">
        <PublicHeader />
        <main id="main" className="mx-auto max-w-[1200px] px-4 pt-4 pb-10 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
