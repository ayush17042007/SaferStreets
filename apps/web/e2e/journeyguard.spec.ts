import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { register, unique } from "./helpers";

const QA = resolve(process.cwd(), "../../docs/qa/m3");
const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shoot(page: Page, name: string) {
  const original = page.viewportSize() ?? { width: 1440, height: 900 };
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(QA, `${name}-${s.name}.png`), fullPage: true });
  }
  await page.setViewportSize(original);
}

test.describe("JourneyGuard (S15 to S17, public track page)", () => {
  test("user starts a journey, extends once, arrives; contact sees first name only", async ({ page, request }) => {
    mkdirSync(QA, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, request, unique(), "Riya Sharma");

    await page.goto("/journeyguard");
    await expect(page.getByRole("heading", { name: "JourneyGuard" })).toBeVisible();
    await page.getByLabel("Destination", { exact: true }).fill("Central library gate");
    await page.getByRole("button", { name: "+30 min" }).click();

    // No contact yet: add one inline, with consent.
    await page.getByRole("combobox", { name: "Trusted contact" }).click();
    await page.getByRole("option", { name: "Add a new contact" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Meera Sharma");
    await page.getByLabel("Relationship").fill("Mother");
    await page.getByLabel("Email", { exact: true }).fill(unique());
    await page.getByLabel(/I have told this person/).check();
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("combobox", { name: "Trusted contact" })).toContainText("Meera Sharma");
    await shoot(page, "start");

    await page.getByRole("button", { name: "Start journey" }).click();

    // In-progress view with the share link shown once and the honest-limits copy.
    await expect(page.getByRole("heading", { name: "To Central library gate" })).toBeVisible({ timeout: 20_000 });
    const trackUrl = await page.getByLabel("Status link").inputValue();
    expect(trackUrl).toContain("/track/");
    const limits = page.getByTestId("honest-limits");
    await expect(limits).toContainText("we email Meera Sharma once");
    await expect(limits).toContainText("We don't track your location.");
    await expect(page.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
    await shoot(page, "in-progress");

    // Extend once: the arrival time moves and the extension count shows.
    await page.getByRole("button", { name: "Extend ETA" }).click();
    await page.getByRole("button", { name: "Add 15 minutes" }).click();
    await expect(page.getByText(/extended 1 time/)).toBeVisible({ timeout: 20_000 });

    // The contact opens the public link without an account: first name only, no live location.
    const guest = await page
      .context()
      .browser()!
      .newContext({ viewport: { width: 1440, height: 900 } });
    const pub = await guest.newPage();
    await pub.goto(trackUrl);
    await expect(pub.getByRole("heading", { name: "Riya is travelling to Central library gate" })).toBeVisible();
    await expect(pub.getByText("On the way")).toBeVisible();
    await expect(pub.getByText("SaferStreets does not show live location.")).toBeVisible();
    await expect(pub.locator("body")).not.toContainText("Sharma");
    await expect(pub.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await shoot(pub, "track");
    await pub.getByRole("button", { name: "Stop these emails" }).click();
    await expect(pub.getByRole("status")).toContainText("You won't get more emails");
    await guest.close();

    // The user confirms arrival; the start form comes back and the journey is in history.
    await page.getByRole("button", { name: "I've arrived safely" }).click();
    await expect(page.getByRole("button", { name: "Start journey" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Past journeys" })).toContainText("Arrived safely");
  });

  test("a bad link shows the neutral message", async ({ page }) => {
    await page.goto("/track/not-a-real-token-not-a-real-token-1234");
    await expect(page.getByRole("heading", { name: "This link isn't available." })).toBeVisible();
    await shoot(page, "track-missing");
  });
});
