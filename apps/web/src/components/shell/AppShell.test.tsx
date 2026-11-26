import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/automate",
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

const { AppShell } = await import("./AppShell");
const { adminNav, appNav, tabNav, isActive } = await import("./nav");

const NUMBERS = [
  { key: "emergency", label: "Emergency", number: "112" },
  { key: "police", label: "Police", number: "100" },
];

function setup(variant: "app" | "admin" = "app", active?: string) {
  return render(
    <AppShell
      variant={variant}
      user={{ name: "Riya Sharma" }}
      unread
      emergencyNumbers={NUMBERS}
      {...(active ? { activeHref: active } : {})}
    >
      <p>content</p>
    </AppShell>,
  );
}

describe("AppShell breakpoints (class contract; real layout is measured in Playwright)", () => {
  it("sidebar: hidden below 768, 64 px icon-only from 768, 240 px from 1024", () => {
    setup();
    const aside = screen.getByRole("complementary", { name: "Primary" });
    expect(aside).toHaveClass("hidden", "md:flex", "w-16", "lg:w-60");
  });

  it("content is offset by the sidebar width at each breakpoint", () => {
    const { container } = setup();
    expect(container.querySelector("#main")?.parentElement).toHaveClass("md:pl-16", "lg:pl-60");
  });

  it("tab bar is mobile only and respects the safe-area inset", () => {
    setup();
    const tabs = screen.getByRole("navigation", { name: "Main" });
    expect(tabs).toHaveClass("md:hidden");
    expect(tabs.className).toContain("safe-area-inset-bottom");
  });

  it("desktop top bar is hidden on mobile; mobile top bar is hidden from 768", () => {
    const { container } = setup();
    const headers = container.querySelectorAll("header");
    expect(headers[0]).toHaveClass("hidden", "md:flex", "h-16");
    expect(headers[1]).toHaveClass("md:hidden");
  });
});

describe("AppShell content", () => {
  it("lists the six sidebar items with labels (visible on desktop, sr-only on tablet)", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(appNav.map((i) => i.label));
    expect(appNav.map((i) => i.label)).toEqual([
      "Dashboard",
      "SafeRoute",
      "AutoMate",
      "JourneyGuard",
      "SafeAlert",
      "Notifications",
    ]);
    expect(within(nav).getByText("Dashboard")).toHaveClass("sr-only", "lg:not-sr-only");
  });

  it("marks the active sidebar item ink with white text and an amber icon", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const active = within(nav).getByRole("link", { name: "AutoMate" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("bg-ink", "text-white", "font-semibold");
    expect(active.querySelector("svg")).toHaveClass("text-amber");
    expect(within(nav).getByRole("link", { name: "SafeRoute" })).not.toHaveAttribute("aria-current");
  });

  it("tab bar has Home, Routes, Rides, Journey, Alerts with a 3 x 16 amber bar on the active tab only", () => {
    setup();
    const tabs = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Home", "Routes", "Rides", "Journey", "Alerts"]);
    expect(tabNav).toHaveLength(5);
    const bars = tabs.querySelectorAll("span.bg-amber");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveClass("h-[3px]", "w-4");
    const active = within(tabs).getByRole("link", { name: "Rides" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("text-ink", "font-semibold");
  });

  it("desktop top bar has the search field, Emergency button, bell with unread dot and avatar", () => {
    setup();
    expect(screen.getByRole("searchbox", { name: "Search reports, rides, places" })).toHaveAttribute(
      "placeholder",
      "Search reports, rides, places",
    );
    expect(screen.getByRole("button", { name: "Emergency" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Notifications, unread" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Account menu for Riya Sharma" }).length).toBeGreaterThan(0);
  });

  it("admin variant swaps the sidebar to the admin items and drops the tab bar", () => {
    setup("admin", "/admin/users");
    const nav = screen.getByRole("navigation", { name: "Admin sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Overview", "Moderation", "Users", "Flags", "Audit log", "Settings"]);
    expect(adminNav).toHaveLength(6);
    expect(within(nav).getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("exposes a skip link to the main content", () => {
    setup();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });
});

describe("isActive", () => {
  it("matches nested paths but keeps /admin exact", () => {
    expect(isActive("/saferoute", "/saferoute/new")).toBe(true);
    expect(isActive("/saferoute", "/saferoute-x")).toBe(false);
    expect(isActive("/admin", "/admin/users")).toBe(false);
    expect(isActive("/admin", "/admin")).toBe(true);
  });
});

describe("emergency menu", () => {
  it("opens the sheet below 768 with tel: links (jsdom reports a narrow viewport)", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Emergency numbers" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /Emergency\s*112/ })).toHaveAttribute("href", "tel:112");
    expect(within(dialog).getByRole("link", { name: /Police\s*100/ })).toHaveAttribute("href", "tel:100");
    expect(dialog).toHaveTextContent("not an emergency service");
  });
});
