"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui";

/** Simple header for guests on pages they may read: logo, Log in, Get started. */
export function PublicHeader() {
  const next = encodeURIComponent(usePathname());
  return (
    <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 md:px-6 lg:px-8">
      <Link href="/" aria-label="SaferStreets home" className="rounded-control">
        <Logo />
      </Link>
      <nav aria-label="Account" className="flex items-center gap-2">
        <Link
          href={`/login?next=${next}`}
          className="inline-flex min-h-11 items-center px-3 text-[14px] leading-5 font-medium text-ink"
        >
          Log in
        </Link>
        <Button asChild size="mobile">
          <Link href={`/login?next=${next}`}>Get started</Link>
        </Button>
      </nav>
    </header>
  );
}
