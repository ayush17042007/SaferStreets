"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Overview", admin: false },
  { href: "/admin/queue", label: "Queue", admin: false },
  { href: "/admin/flags", label: "Flags", admin: false },
  { href: "/admin/users", label: "Users", admin: false },
  { href: "/admin/audit", label: "Audit log", admin: true },
  { href: "/admin/settings", label: "Settings", admin: true },
];

export function AdminNav({ role }: { role: "MODERATOR" | "ADMIN" }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
      {ITEMS.filter((i) => !i.admin || role === "ADMIN").map((i) => {
        const on = i.href === "/admin" ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-chip border px-4 text-[14px] leading-5 font-medium",
              on ? "border-ink bg-ink text-white" : "border-line-control bg-card text-ink hover:bg-neutral-bubble",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
