"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button, Icon, cn } from "@/components/ui";

export const landingLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Height 64, cream, no bottom border until the page is scrolled (A5.1). Mobile: logo, Get started, menu. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-cream transition-[border-color] duration-fast",
        scrolled ? "border-line" : "border-transparent",
      )}
      data-scrolled={scrolled}
    >
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 md:px-6 lg:px-0">
        <Link href="/" aria-label="SaferStreets home" className="rounded-control">
          <Logo />
        </Link>

        <nav aria-label="Page sections" className="hidden items-center gap-8 lg:flex">
          {landingLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-control py-2 text-[14px] leading-5 font-medium text-text-secondary hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="/login"
            className="hidden min-h-11 items-center rounded-control px-1 text-[14px] leading-5 font-medium text-ink md:inline-flex"
          >
            Log in
          </Link>
          <Button asChild size="mobile" className="md:h-10">
            <Link href="/login">
              Get started
              <Icon name="arrow" size={16} className="text-amber" />
            </Link>
          </Button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink hover:bg-neutral-bubble lg:hidden"
          >
            <Icon name={open ? "close" : "menu"} size={24} />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Page sections"
          className="fade-in border-t border-line bg-cream px-4 pt-2 pb-4 md:px-6 lg:hidden"
        >
          <ul className="mx-auto flex max-w-[1120px] flex-col">
            {landingLinks.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-line text-[16px] leading-6 font-medium text-ink"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="md:hidden">
              <Link href="/login" className="flex min-h-12 items-center text-[16px] leading-6 font-medium text-ink">
                Log in
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
