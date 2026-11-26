import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { LoginForm } from "@/components/auth/LoginForm";
import { getMeOrNull, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Log in or sign up", robots: { index: false } };
// Reads the session cookie and the Turnstile site key at request time.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getMeOrNull();
  if (me) redirect(me.needsOnboarding ? "/welcome" : safeNext(next));
  return (
    <AuthSplit>
      <LoginForm
        siteKey={process.env.TURNSTILE_SITE_KEY ?? ""}
        next={next ? safeNext(next, "") || undefined : undefined}
      />
    </AuthSplit>
  );
}
