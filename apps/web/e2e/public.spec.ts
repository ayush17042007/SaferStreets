import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
] as const;

const PAGES = [
  { slug: "landing", path: "/" },
  { slug: "terms", path: "/terms" },
  { slug: "privacy", path: "/privacy" },
  { slug: "safety", path: "/safety" },
  { slug: "about", path: "/about" },
  { slug: "403", path: "/403" },
  { slug: "500", path: "/500" },
  { slug: "maintenance", path: "/maintenance" },
  { slug: "404", path: "/this-page-does-not-exist" },
] as const;

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

test.describe("public site navigation", () => {
  test("landing nav links, CTAs and footer lead to the right places", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Light up\s*every\s*journey\./);
    const nav = page.getByRole("navigation", { name: "Page sections" }).first();
    for (const [label, id] of [
      ["Features", "features"],
      ["How it works", "how-it-works"],
      ["Safety", "safety"],
      ["FAQ", "faq"],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await page.getByRole("banner").getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await open(page, "/");
    for (const [label, path] of [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Safety disclaimer", "/safety"],
      ["About", "/about"],
    ] as const) {
      await page.getByRole("contentinfo").getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await page.goBack();
    }
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Call 112" })).toHaveAttribute(
      "href",
      "tel:112",
    );
  });

  test("legal pages show the draft banner (About does not)", async ({ page }) => {
    for (const path of ["/terms", "/privacy", "/safety"]) {
      await open(page, path);
      await expect(page.getByText("Draft: review with a lawyer before launch")).toBeVisible();
    }
    await open(page, "/about");
    await expect(page.getByText("Draft: review with a lawyer before launch")).toHaveCount(0);
  });

  test("the nav gains a bottom border only after scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/");
    const header = page.getByRole("banner");
    await expect(header).toHaveAttribute("data-scrolled", "false");
    expect(await header.evaluate((e) => getComputedStyle(e).borderBottomColor)).toBe("rgba(0, 0, 0, 0)");
    await page.mouse.wheel(0, 600);
    await expect(header).toHaveAttribute("data-scrolled", "true");
    // The colour fades in over 150 ms, so poll rather than read once.
    await expect.poll(() => header.evaluate((e) => getComputedStyle(e).borderBottomColor)).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("mobile menu opens, lists the sections and closes on selection and Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link")).toHaveText(["Features", "How it works", "Safety", "FAQ", "Log in"]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("#mobile-menu").getByRole("link", { name: "FAQ" }).click();
    await expect(page.locator("#mobile-menu")).toHaveCount(0);
    await expect(page).toHaveURL(/#faq$/);
  });

  test("FAQ works from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/");
    const triggers = page.locator("#faq button[aria-expanded]");
    await triggers.first().focus();
    await expect(triggers.first()).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(triggers.first()).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await expect(triggers.nth(1)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(triggers.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(triggers.first()).toHaveAttribute("aria-expanded", "false");
  });

  test("landing carries the A5.1 copy and no invented numbers", async ({ page }) => {
    await open(page, "/");
    for (const text of [
      "Free for campuses and commuters",
      "Report unsafe spots, share an auto, and let someone you trust know you're on your way. One account, four tools.",
      "Email login, no passwords",
      "No app download",
      "Streetlight fixed",
      "Gate 2 road",
      "2 seats left",
      "About ₹40 each",
      "60 sec",
      "to file a report",
      "5 taps",
      "to request a ride",
      "30 sec",
      "to start a journey",
      "45 sec",
      "to raise an alert",
      "Report broken lights and unsafe spots, then watch them get fixed.",
      "Share an auto with people heading your way and split the fare.",
      "Tell a trusted person where you're going and when you'll arrive.",
      "Warn opted-in people nearby when something goes wrong.",
    ]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Get started free" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "See how it works" })).toBeVisible();
    await expect(page.getByText(/testimonial|users trust|\d+k\+/i)).toHaveCount(0);
  });

  test("hero: 48 px amber CTA and the amber highlight on 'journey.'", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/");
    const cta = page.getByRole("link", { name: "Get started free" }).first();
    expect((await cta.boundingBox())!.height).toBe(48);
    const hl = page.getByRole("heading", { level: 1 }).locator("span");
    expect(await hl.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 176, 32)");
    expect(await hl.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("12px");
  });
});

test.describe("app shell at three breakpoints (/dev/shell)", () => {
  test("desktop 1440: 240 px sidebar, 64 px cream top bar, no tab bar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/dev/shell");
    const side = page.getByRole("complementary", { name: "Primary" });
    expect((await side.boundingBox())!.width).toBe(240);
    const top = page.locator("header").first();
    expect((await top.boundingBox())!.height).toBe(64);
    expect(await top.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(250, 247, 242)");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByRole("searchbox", { name: "Search reports, rides, places" })).toBeVisible();
    expect((await page.getByRole("searchbox").boundingBox())!.width).toBeLessThanOrEqual(360);
    await expect(side.getByText("Dashboard")).toBeVisible();
  });

  test("tablet 768: icon-only 64 px sidebar, labels hidden", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page, "/dev/shell");
    const side = page.getByRole("complementary", { name: "Primary" });
    expect((await side.boundingBox())!.width).toBe(64);
    const label = side.getByText("Dashboard");
    expect((await label.boundingBox())!.width).toBeLessThanOrEqual(1);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  });

  test("mobile 390: no sidebar, top bar with logo, bell and avatar, 64 px tab bar with amber active bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/dev/shell?active=/saferoute");
    await expect(page.getByRole("complementary", { name: "Primary" })).toBeHidden();
    const tabs = page.getByRole("navigation", { name: "Main" });
    expect((await tabs.locator("ul").boundingBox())!.height).toBe(64);
    await expect(tabs.getByRole("link")).toHaveText(["Home", "Routes", "Rides", "Journey", "Alerts"]);
    const bar = tabs.locator("span.bg-amber");
    await expect(bar).toHaveCount(1);
    const box = (await bar.boundingBox())!;
    expect(box.width).toBe(16);
    expect(box.height).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test("admin variant shows Overview, Moderation, Users, Flags, Audit log, Settings", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/dev/shell?variant=admin&active=/admin/users");
    const nav = page.getByRole("navigation", { name: "Admin sections" });
    await expect(nav.getByRole("link")).toHaveText([
      "Overview",
      "Moderation",
      "Users",
      "Flags",
      "Audit log",
      "Settings",
    ]);
    await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  });

  test("emergency: popover on desktop, bottom sheet on mobile, tel: links", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/dev/shell");
    await page.getByRole("button", { name: "Emergency" }).click();
    const pop = page.getByRole("dialog", { name: "Emergency numbers" });
    await expect(pop).toBeVisible();
    await expect(pop.getByRole("link")).toHaveCount(5);
    await expect(pop.getByRole("link", { name: /Emergency\s*112/ })).toHaveAttribute("href", "tel:112");
    await expect(pop.getByRole("link", { name: /Women helpline\s*1091/ })).toHaveAttribute("href", "tel:1091");
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/dev/shell");
    await page.getByRole("button", { name: "Emergency numbers" }).click();
    const sheet = page.getByRole("dialog", { name: "Emergency numbers" });
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(843); // docked to the bottom
    await expect(sheet.getByRole("link", { name: /Police\s*100/ })).toHaveAttribute("href", "tel:100");
  });

  test("signed-in routes send visitors to /login with a return path", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  });
});

test.describe("accessibility (axe, WCAG 2.2 AA incl. contrast)", () => {
  for (const p of [
    ...PAGES,
    { slug: "dev-shell", path: "/dev/shell" },
    { slug: "dev-shell-admin", path: "/dev/shell?variant=admin" },
  ]) {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
      test(`${p.slug} at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await open(page, p.path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          results.violations.map(
            (v) =>
              `${v.id}: ${v.nodes
                .map((n) => n.target.join(" "))
                .slice(0, 3)
                .join(" | ")}`,
          ),
        ).toEqual([]);
      });
    }
  }
});

test.describe("visual baselines", () => {
  const targets = [
    ...PAGES,
    { slug: "dev-shell", path: "/dev/shell" },
    { slug: "dev-shell-admin", path: "/dev/shell?variant=admin" },
  ];
  for (const p of targets) {
    for (const vp of VIEWPORTS) {
      test(`${p.slug} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await open(page, p.path);
        await expect(page).toHaveScreenshot(`${p.slug}-${vp.name}.png`, { fullPage: true });
      });
    }
  }
});
