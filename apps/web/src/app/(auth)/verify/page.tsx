import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { VerifyForm } from "@/components/auth/VerifyForm";
import { getMeOrNull, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Enter your code", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getMeOrNull();
  if (me) redirect(me.needsOnboarding ? "/welcome" : safeNext(next));
  return (
    <AuthSplit>
      <VerifyForm siteKey={process.env.TURNSTILE_SITE_KEY ?? ""} next={safeNext(next)} />
    </AuthSplit>
  );
}
