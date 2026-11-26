import { expect, test, type Page } from "@playwright/test";
import { register, unique } from "./helpers";

/** Click a spot inside the nth picker map (same approach as map.spec.ts), retrying until the map is ready. */
async function pickOnMap(page: Page, nth: number, fx: number, fy: number) {
  const map = page.getByTestId("picker-map").nth(nth);
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await expect(page.getByTestId("picker-value")).toHaveCount(nth + 1, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

/** Phones are only shown between ride members, so both users need one on their profile. */
async function setPhone(page: Page, phone: string) {
  const res = await page.request.patch("/api/v1/me", {
    headers: { "x-requested-with": "XMLHttpRequest" },
    data: { phone },
  });
  expect(res.ok()).toBeTruthy();
}

/** A datetime-local value (India time) one hour from now. */
function inOneHourIst(): string {
  return new Date(Date.now() + 60 * 60_000 + 330 * 60_000).toISOString().slice(0, 16);
}

test.describe("AutoMate (S10 to S13)", () => {
  test("host offers a ride, rider requests, host accepts, rider sees the phone, guests see no host", async ({
    page,
    request,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Offering a ride needs an account; browsing does not.
    await page.goto("/automate/new");
    await expect(page).toHaveURL(/\/login\?next=/);

    await register(page, request, unique(), "Riya Sharma");
    await setPhone(page, "9876543210");

    await page.goto("/automate/new");
    await pickOnMap(page, 0, 0.5, 0.4);
    await pickOnMap(page, 1, 0.5, 0.6);
    await page.getByLabel("Departure (India time)").fill(inOneHourIst());
    await page.getByRole("radio", { name: "3" }).click();
    await page.getByLabel("Total fare for the auto (INR)").fill("200");
    // Fare 200 over 3 seats plus the host: 4 people, 50 each.
    await expect(page.getByTestId("fare-preview")).toContainText("50");
    await page.getByRole("button", { name: "Offer ride" }).click();

    await expect(page).toHaveURL(/\/automate\/[0-9a-f-]{36}/);
    const rideUrl = page.url().split("?")[0]!;
    await expect(page.getByText("Ride offered")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request to join" })).toHaveCount(0);

    // A guest sees the ride in the list, with no host name.
    const guest = await browser.newContext({
      baseURL: "http://localhost:3101",
      viewport: { width: 1440, height: 900 },
    });
    const gp = await guest.newPage();
    await gp.goto("/automate");
    const card = gp.getByTestId("ride-card").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Log in to see who is driving");
    await expect(card).not.toContainText("Riya");
    await guest.close();

    // A second user requests to join.
    const other = await browser.newContext({
      baseURL: "http://localhost:3101",
      viewport: { width: 1440, height: 900 },
    });
    const page2 = await other.newPage();
    await register(page2, request, unique(), "Arjun Kumar");
    await setPhone(page2, "9123456780");
    await page2.goto(rideUrl);
    await expect(page2.getByText("Riya Sharma").first()).toBeVisible();
    await page2.getByRole("button", { name: "Request to join" }).click();
    await page2.getByLabel("Message").fill("I will wait at the gate.");
    await page2.getByRole("button", { name: "Send request" }).click();
    await expect(page2.getByText("Request pending")).toBeVisible();
    await expect(page2.getByTestId("member-phone")).toHaveCount(0);

    // The host accepts.
    await page.goto(rideUrl);
    const row = page.getByTestId("request-row").filter({ hasText: "Arjun Kumar" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByTestId("request-row")).toHaveCount(0);
    await expect(page.getByTestId("members-card")).toContainText("Arjun Kumar");

    // The rider now sees the host's phone and can leave.
    await page2.reload();
    await expect(page2.getByText("You are riding")).toBeVisible();
    await expect(page2.getByTestId("member-phone").first()).toHaveAttribute("href", /^tel:/);
    await expect(page2.getByRole("button", { name: "Leave ride" })).toBeVisible();
    await other.close();
  });
});
