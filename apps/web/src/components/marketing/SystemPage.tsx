import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyArt, type EmptyArtKind } from "@/components/brand/EmptyArt";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui";

/** 404, 403, 500 and maintenance pages in Lamplight style (appendix-04 system pages). */
export function SystemPage({
  code,
  title,
  description,
  art = "quiet",
  actions,
  note,
}: {
  code: string;
  title: string;
  description: string;
  art?: EmptyArtKind;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center px-4 md:px-6 lg:px-0">
        <Link href="/" aria-label="SaferStreets home" className="rounded-control">
          <Logo />
        </Link>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center"
      >
        <EmptyArt kind={art} className="scale-125" />
        <p className="text-[12px] leading-4 font-medium text-text-secondary">Error {code}</p>
        <h1 className="type-h1">{title}</h1>
        <p className="text-[16px] leading-6 text-text-secondary">{description}</p>
        {actions ? <div className="mt-2 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
        {note}
        <p className="mt-6 flex items-center gap-2 text-[14px] leading-5 text-text-secondary">
          <Icon name="emergency" size={16} />
          In danger? Call{" "}
          <a
            href="tel:112"
            className="font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
          >
            112
          </a>{" "}
          first.
        </p>
      </main>
    </div>
  );
}
