import Link from "next/link";
import type { ReactNode } from "react";
import { Banner } from "@/components/ui";
import { site } from "@/config/site";
import { Footer } from "./Footer";
import { LandingNav } from "./LandingNav";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared layout for Terms, Privacy, Safety disclaimer and About (B13). Drafts always show the notice. */
export function LegalPage({
  title,
  intro,
  sections,
  draft = true,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  draft?: boolean;
}) {
  return (
    <>
      <LandingNav />
      <main id="main" className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-12 lg:px-0">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <nav aria-label="Breadcrumb" className="text-[14px] leading-5 text-text-secondary">
            <Link href="/" className="font-medium hover:text-ink">
              Home
            </Link>{" "}
            / {title}
          </nav>
          {draft ? (
            <Banner tone="amber-warn" title={site.draftNotice}>
              These texts are drafts and are not legal advice.
            </Banner>
          ) : null}
          <header className="flex flex-col gap-2">
            <h1 className="type-h1">{title}</h1>
            <p className="text-[16px] leading-6 text-text-secondary">{intro}</p>
            <p className="text-[12px] leading-4 text-text-secondary">Last updated {site.legalUpdated}</p>
          </header>
          <nav aria-label="On this page" className="rounded-card border border-line bg-card p-4">
            <p className="mb-1 text-[14px] leading-5 font-semibold">On this page</p>
            <ul className="flex flex-col">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex min-h-11 items-center text-[14px] leading-5 text-text-secondary hover:text-ink"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-8">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24">
                <h2 id={`${s.id}-h`} className="type-h2 mb-2">
                  {s.title}
                </h2>
                <div className="flex flex-col gap-3 text-[16px] leading-6 text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function GrievanceBlock() {
  return (
    <p>
      Grievance officer: {site.grievance.officer}. Email: {site.grievance.email}. We aim to reply within{" "}
      {site.grievance.responseDays} days.
    </p>
  );
}
