import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { e2eApiEnv } from "./global-setup";
import { register, unique } from "./helpers";

const root = resolve(process.cwd(), "../..");
const win = process.platform === "win32";

/** Back-date the account in the TEST database so the 24 h posting gate and 7 day review-first rule do not apply. */
function ageAccount(email: string) {
  execFileSync(
    win ? "pnpm.cmd" : "pnpm",
    ["--filter", "@saferstreets/api", "exec", "tsx", "--conditions=source", "scripts/e2e-age-user.ts", email],
    { cwd: root, env: e2eApiEnv(), stdio: "pipe", shell: win },
  );
}

async function pickOnMap(page: Page, fx: number, fy: number) {
  const map = page.getByTestId("picker-map");
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await expect(page.getByTestId("picker-value")).toHaveCount(1, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

test.describe("SafeAlert (M4)", () => {
  test("a new account is told why it can't post; an eligible user posts, others confirm, guests see limits", async ({
    page,
    request,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Posting and settings need an account; the feed does not.
    await page.goto("/safealert/new");
    await expect(page).toHaveURL(/\/login\?next=/);

    const authorEmail = unique();
    await register(page, request, authorEmail, "Riya Sharma");

    // Brand-new account: the reason is shown upfront and the button is disabled.
    await page.goto("/safealert/new");
    await expect(page.getByText("You can't post alerts yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post alert" })).toBeDisabled();

    ageAccount(authorEmail);
    await page.goto("/safealert/new");
    await expect(page.getByRole("button", { name: "Post alert" })).toBeEnabled();
    await expect(page.getByText("We do not contact police or emergency services.").first()).toBeVisible();
    await page.getByRole("radio", { name: "Road accident" }).click();
    await page.getByLabel("Describe what you see").fill("Two autos collided near the main gate, traffic is slow.");
    await pickOnMap(page, 0.45, 0.5);
    await page.getByLabel("Address").fill("Main gate, University Road");
    await page.getByRole("button", { name: "Post alert" }).click();

    await expect(page).toHaveURL(/\/safealert\/[0-9a-f-]{36}$/);
    const alertUrl = page.url();
    await expect(page.getByText("Unverified").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Call 112" }).first()).toHaveAttribute("href", "tel:112");
    await expect(page.getByText("Two autos collided near the main gate")).toBeVisible();
    // The author cannot vote on their own alert, and is told why.
    await expect(page.getByRole("button", { name: /Confirm \(0\)/ })).toBeDisabled();
    await expect(page.getByTestId("vote-reason")).toContainText("You posted this alert");

    // Another signed-in user sees the alert in the feed and confirms it.
    const other = await browser.newContext({
      baseURL: "http://localhost:3101",
      viewport: { width: 1440, height: 900 },
    });
    const op = await other.newPage();
    await register(op, request, unique(), "Aman Verma");
    await op.goto("/safealert");
    const card = op.getByTestId("alert-card").first();
    await expect(card).toContainText("Road accident");
    await expect(card).toContainText("Unverified");
    await card.click();
    await expect(op).toHaveURL(alertUrl);
    await op.getByRole("button", { name: /Confirm \(0\)/ }).click();
    await expect(op.getByRole("button", { name: /Confirm \(1\)/ })).toHaveAttribute("aria-pressed", "true");
    await other.close();

    // A guest sees a limited card: no description, no address.
    const guest = await browser.newContext({
      baseURL: "http://localhost:3101",
      viewport: { width: 1440, height: 900 },
    });
    const gp = await guest.newPage();
    await gp.goto("/safealert");
    const gcard = gp.getByTestId("alert-card").first();
    await expect(gcard).toBeVisible();
    await expect(gcard).toContainText("Log in to see details");
    await expect(gcard).toContainText("Approximate location");
    await expect(gcard).not.toContainText("Two autos collided");
    await expect(gcard).not.toContainText("University Road");
    await expect(gp.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
    await guest.close();

    // Alert area settings save and survive a reload.
    await page.goto("/settings#alerts");
    await expect(page.getByRole("heading", { name: "Safety alerts" }).first()).toBeVisible();
    await page.getByRole("switch", { name: "Get alerts near me" }).click();
    await pickOnMap(page, 0.5, 0.5);
    await page.getByLabel("Radius").fill("5");
    await page.getByRole("button", { name: "Road accident" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Alert settings saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("radius-value")).toHaveText("5 km");
    await expect(page.getByRole("switch", { name: "Get alerts near me" })).toHaveAttribute("aria-checked", "true");
  });
});
