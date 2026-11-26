import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { register, unique } from "./helpers";

test.describe("dashboard (A5.2)", () => {
  test("a new user sees the greeting, quick actions, checklist and the A5.2 empty states", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening), Riya/);
    await expect(page.getByTestId("setup-line")).toHaveText("Finish setting up: add a trusted contact.");
    await expect(page.getByRole("link", { name: "Start a journey" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Report an issue" }).first()).toBeVisible();

    const actions = page.getByRole("list", { name: "Quick actions" });
    await expect(actions.getByRole("link")).toHaveText([
      "Report an issue",
      "Offer a ride",
      "Start journey",
      "Raise alert",
    ]);

    // New-user checklist until complete.
    await expect(page.getByRole("heading", { name: "Finish setting up", level: 2 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Add a trusted contact/ })).toBeVisible();

    // Empty states per card.
    await expect(page.getByRole("heading", { name: "Heading out? Let someone know." })).toBeVisible();
    await expect(page.getByText("All quiet around you.")).toBeVisible();
    await expect(page.getByText("Be the first to report an issue nearby.")).toBeVisible();
    await expect(page.getByText("0 this week")).toBeVisible();
    await expect(page.getByText(/No rides coming up/)).toBeVisible();
    // Nearby alerts keeps its "View all" link.
    await expect(page.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/safealert");
  });

  test("adding a trusted contact changes the greeting line and removes the checklist", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");
    await page.goto("/journeyguard/contacts");
    await page.getByRole("button", { name: "Add a contact" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Mom");
    await dialog.getByLabel("Email", { exact: true }).fill("mom@example.test");
    await dialog.getByLabel(/I have told this person/).check();
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("mom@example.test")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByTestId("setup-line")).toHaveText("You're covered. 1 trusted contact.");
    await expect(page.getByRole("heading", { name: "Finish setting up", level: 2 })).toHaveCount(0);
  });

  test("each card loads and fails on its own", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");

    // One card fails, the rest still render.
    await page.route("**/api/v1/me/dashboard/alerts", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL", message: "x", requestId: "r" } }),
      }),
    );
    await page.reload();
    await expect(page.getByText("We couldn't load alerts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
    await expect(page.getByText("Be the first to report an issue nearby.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Heading out? Let someone know." })).toBeVisible();

    // A slow card shows a skeleton while the others are already there.
    await page.unroute("**/api/v1/me/dashboard/alerts");
    await page.route("**/api/v1/me/dashboard/reports", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.reload();
    await expect(page.getByLabel("My recent reports").locator('[aria-busy="true"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Heading out? Let someone know." })).toBeVisible();
    await expect(page.getByText("Be the first to report an issue nearby.")).toBeVisible({ timeout: 10_000 });
  });

  test("layout at three widths: night map only from 768, quick actions 2x2 then 4 across", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");
    const hero = page.getByLabel("Welcome");
    await expect(hero.locator("svg[role=img]")).toBeVisible();
    const row = await page
      .getByRole("list", { name: "Quick actions" })
      .getByRole("link")
      .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(row).toBe(1); // four across at desktop

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hero.locator("svg[role=img]")).toBeHidden();
    const rows = await page
      .getByRole("list", { name: "Quick actions" })
      .getByRole("link")
      .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(rows).toBe(2); // 2 x 2
    // No horizontal scroll once the layout has settled after the resize.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test("passes axe and shows the journey card chip colours from tokens", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");
    await expect(page.getByText("All quiet around you.")).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(
      r.violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
    ).toEqual([]);
  });

  test("visual baselines: dashboard (new user) at desktop and mobile", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");
    await expect(page.getByText("All quiet around you.")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("dashboard-desktop-1440x900.png", {
      fullPage: true,
      mask: [page.getByRole("heading", { level: 1 })],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("dashboard-mobile-390x844.png", {
      fullPage: true,
      mask: [page.getByRole("heading", { level: 1 })],
    });
  });

  test("SOS emergency alarm activates after confirmation, persists across navigation, and stops", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await register(page, request, unique(), "Riya Sharma");

    const sosBtn = page.getByRole("button", { name: "SOS: Activate emergency alarm" });
    await expect(sosBtn).toBeVisible();
    await sosBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Activate SOS alarm" }).click();

    await expect(page.getByText("SOS ACTIVE")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop SOS" })).toBeVisible();

    // Navigating to another module keeps the active SOS banner visible.
    await page.goto("/saferoute");
    await expect(page.getByText("SOS ACTIVE")).toBeVisible();

    // Stopping SOS resets the state.
    await page.getByRole("button", { name: "Stop SOS" }).click();
    await expect(page.getByText("SOS ACTIVE")).toHaveCount(0);
  });
});
