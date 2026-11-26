import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui";
import { publicLinks, site } from "@/config/site";

/** Footer with legal links and a "Call 112" helper (A5.1 section 5). Used on every public page. */
export function Footer() {
  return (
    <footer className="border-t border-line bg-cream">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 py-10 md:px-6 lg:px-0">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-sm flex-col gap-2">
            <Logo />
            <p className="text-[14px] leading-5 text-text-secondary">{site.tagline}</p>
          </div>
          <nav aria-label="Legal and about">
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {publicLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-11 items-center text-[14px] leading-5 font-medium text-text-secondary hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-2">
            <p className="text-[14px] leading-5 font-medium">In danger? Call 112 first.</p>
            <a
              href="tel:112"
              className="inline-flex h-11 items-center gap-2 self-start rounded-control border border-coral-border bg-coral-tint px-4 text-[14px] leading-5 font-medium text-coral-text"
            >
              <Icon name="emergency" size={16} />
              Call 112
            </a>
          </div>
        </div>
        <p className="border-t border-line pt-4 text-[12px] leading-4 text-text-secondary">
          SaferStreets is not an emergency service. It doesn&apos;t track your live location and it isn&apos;t connected
          to the police or any authority.
        </p>
      </div>
    </footer>
  );
}
