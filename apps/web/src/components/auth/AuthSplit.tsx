import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { NightMap } from "@/components/brand/NightMap";

/** A5.9: desktop split. Left: centred white card (max 420). Right: ink panel with the night map. Mobile: card only. */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-cream lg:grid-cols-2">
      <main id="main" className="flex items-center justify-center px-4 py-8 md:px-6">
        <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-hero border border-line bg-card p-6 md:p-8">
          <Link href="/" aria-label="SaferStreets home" className="self-start rounded-control">
            <Logo />
          </Link>
          {children}
          <p className="text-[12px] leading-4 text-text-secondary">
            <Link href="/terms" className="underline decoration-line-control underline-offset-2">
              Terms
            </Link>
            {" · "}
            <Link href="/privacy" className="underline decoration-line-control underline-offset-2">
              Privacy
            </Link>
            {" · "}
            <Link href="/safety" className="underline decoration-line-control underline-offset-2">
              Safety disclaimer
            </Link>
          </p>
        </div>
      </main>
      <aside className="relative hidden bg-ink lg:block" aria-hidden="true">
        <div className="absolute inset-0">
          <NightMap breathe />
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink to-transparent p-12 pt-24">
          <p className="type-h1 max-w-sm text-white">Light up every journey.</p>
        </div>
      </aside>
    </div>
  );
}
