import { expect, test, type Page } from "@playwright/test";
import { register, unique } from "./helpers";

/** Click a spot inside the picker map, as a fraction of its box (same approach as map.spec.ts). */
async function clickPicker(page: Page, fx: number, fy: number) {
  await page.getByTestId("picker-map").scrollIntoViewIfNeeded();
  const box = (await page.getByTestId("picker-map").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test.describe("SafeRoute (S6 to S9)", () => {
  test("guests see the empty list, users file a report, others confirm it", async ({ page, request, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // A guest can open the list without logging in; nothing is reported yet.
    await page.goto("/saferoute");
    await expect(page).toHaveURL(/\/saferoute$/);
    await expect(page.getByText("Be the first to report an issue nearby.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

    // Creating a report needs an account.
    await page.goto("/saferoute/new");
    await expect(page).toHaveURL(/\/login\?next=/);

    // A registered user files a report through the four steps.
    await register(page, request, unique(), "Riya Sharma");
    await page.goto("/saferoute/new");
    await expect(page.getByText("1 of 4")).toBeVisible();
    await page.getByRole("radio", { name: "Pothole" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("2 of 4")).toBeVisible();
    await expect(page.getByTestId("picker-map").locator("canvas.maplibregl-canvas")).toBeVisible();
    await clickPicker(page, 0.5, 0.5);
    await expect(page.getByTestId("picker-value")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("3 of 4")).toBeVisible();
    await page.getByLabel("Title").fill("Deep pothole near Gate 2");
    await page.getByLabel("Description").fill("A deep pothole in the left lane that is hard to see after dark.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("4 of 4")).toBeVisible();
    await expect(page.getByTestId("review-card")).toContainText("Deep pothole near Gate 2");
    await page.getByRole("button", { name: "Submit report" }).click();

    await expect(page).toHaveURL(/\/saferoute\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const detailUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: "Deep pothole near Gate 2" })).toBeVisible();
    await expect(page.getByText("Report submitted.")).toBeVisible();

    // The owner can edit while the report is submitted, and cannot confirm their own report.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm this issue" })).toHaveCount(0);

    // The list shows it.
    await page.goto("/saferoute");
    await expect(page.getByTestId("report-row").filter({ hasText: "Deep pothole near Gate 2" })).toBeVisible();

    // A second user confirms it; the button toggles to "Confirmed" with an undo.
    const other = await browser.newContext({
      baseURL: "http://localhost:3101",
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    });
    const page2 = await other.newPage();
    await register(page2, request, unique(), "Arjun Kumar");
    await page2.goto(detailUrl);
    await expect(page2.getByRole("heading", { level: 1, name: "Deep pothole near Gate 2" })).toBeVisible();
    await expect(page2.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await page2.getByRole("button", { name: "Confirm this issue" }).click();
    await expect(page2.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(page2.getByTestId("confirm-count")).toHaveText("1 person confirmed");
    await page2.getByRole("button", { name: "Undo" }).click();
    await expect(page2.getByRole("button", { name: "Confirm this issue" })).toBeVisible();
    await expect(page2.getByTestId("confirm-count")).toHaveText("0 people confirmed");
    await other.close();

    // A guest can read the detail page and is invited to log in to confirm.
    const guest = await browser.newContext({ baseURL: "http://localhost:3101" });
    const page3 = await guest.newPage();
    await page3.goto(detailUrl);
    await expect(page3.getByRole("link", { name: "Log in to confirm" })).toBeVisible();
    await guest.close();
  });
});
