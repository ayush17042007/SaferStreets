import { use } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Banner, Card, StatusChip } from "@/components/ui";

/** DEV PROPS: fixed demo name, unread dot on, 112/100/108/1091/101 numbers. Not real user data. */
const DEV_USER = { name: "Dev Preview" };
const DEV_NUMBERS = [
  { key: "emergency", label: "Emergency", number: "112" },
  { key: "police", label: "Police", number: "100" },
  { key: "ambulance", label: "Ambulance", number: "108" },
  { key: "womenHelpline", label: "Women helpline", number: "1091" },
  { key: "fire", label: "Fire", number: "101" },
];

export function ShellPreview({ searchParams }: { searchParams: Promise<{ variant?: string; active?: string }> }) {
  const { variant, active } = use(searchParams);
  const isAdmin = variant === "admin";
  return (
    <AppShell
      variant={isAdmin ? "admin" : "app"}
      user={DEV_USER}
      unread
      activeHref={active ?? (isAdmin ? "/admin" : "/dashboard")}
      emergencyNumbers={DEV_NUMBERS}
    >
      <div className="flex flex-col gap-4">
        <Banner tone="amber-warn" title="Dev shell preview">
          This page uses fixed dev props (user, unread dot, emergency numbers) so the shell can be screenshotted. Use
          ?variant=admin or ?active=/automate.
        </Banner>
        <h1 className="type-h1">{isAdmin ? "Overview" : "Dashboard"}</h1>
        <Card className="flex items-center justify-between gap-3">
          <p className="text-[14px] leading-5">Content area on cream with the shell around it.</p>
          <StatusChip tone="neutral" label="Dev only" />
        </Card>
      </div>
    </AppShell>
  );
}
