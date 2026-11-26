import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { WelcomeForm } from "@/components/profile/WelcomeForm";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Onboarding for new emails, shown after the code step (appendix-04 S2/S4). */
export default async function WelcomePage() {
  const me = await requireMe();
  if (!me.needsOnboarding) redirect("/dashboard");
  return (
    <AuthSplit>
      <WelcomeForm />
    </AuthSplit>
  );
}
