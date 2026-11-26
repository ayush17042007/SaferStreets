import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/dev/map");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

/** Click a spot inside the picker map, as a fraction of its box. */
async function clickPicker(page: Page, fx: number, fy: number) {
  await page.getByTestId("picker-map").scrollIntoViewIfNeeded();
  const box = (await page.getByTestId("picker-map").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test.describe("MapView", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
  });

  test("renders a map with clustered report markers and alert and ride markers", async ({ page }) => {
    await expect(page.getByTestId("map-canvas").locator("canvas.maplibregl-canvas")).toBeVisible();
    // The three nearby reports collapse into one ink cluster with a white count.
    const cluster = page.locator("[data-cluster]").first();
    await expect(cluster).toHaveAttribute("data-cluster", "3");
    expect(await cluster.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(17, 26, 59)");
    expect(await cluster.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)");
    await expect(page.locator('[data-marker-kind="alert"]')).toHaveCount(1);
    await expect(page.locator('[data-marker-kind="ride"]')).toHaveCount(2);
    // Alert pins pulse; ride markers are mint.
    await expect(page.locator('[data-marker-kind="alert"] .pulse-ring')).toHaveCount(1);
    expect(
      await page
        .locator('[data-marker-kind="ride"] span')
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgb(25, 195, 154)");
  });

  test("a cluster zooms in and then shows the individual amber lamp pins", async ({ page }) => {
    await page.locator("[data-cluster]").first().click();
    await expect(page.locator('[data-marker-kind="report"]')).toHaveCount(3, { timeout: 10_000 });
    const dot = page.locator('[data-marker-kind="report"] span').nth(1);
    expect(await dot.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 176, 32)");
  });

  test("selecting an item marks it with an ink pin and a white ring", async ({ page }) => {
    await page.locator('[data-marker-kind="alert"]').click();
    await expect(page.getByTestId("selected")).toHaveText("Selected: a1");
    const selected = page.locator('[data-marker-id="a1"][data-selected="true"] span');
    await expect(selected).toBeVisible();
    expect(await selected.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(17, 26, 59)");
    expect(await selected.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe("rgb(255, 255, 255)");
  });

  test("always offers a list alternative that works with the keyboard", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Show as list" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    const list = page.getByRole("list", { name: "Items on the map" });
    await expect(list.getByRole("button")).toHaveCount(6);
    await list.getByRole("button", { name: /Pothole on Main Road/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("selected")).toHaveText("Selected: r2");
  });
});

test.describe("LocationPicker", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
  });

  test("a pin inside the service area is accepted", async ({ page }) => {
    await clickPicker(page, 0.5, 0.5);
    const json = page.getByTestId("picked-json");
    await expect(json).toContainText('"lat"');
    const picked = JSON.parse((await json.textContent())!);
    expect(picked.lat).toBeGreaterThan(24.9);
    expect(picked.lat).toBeLessThan(25.4);
    expect(picked.lng).toBeGreaterThan(75.6);
    expect(picked.lng).toBeLessThan(76.1);
    await expect(page.getByTestId("picker-error")).toHaveCount(0);
  });

  test("a pin outside the service area is rejected with a calm message", async ({ page }) => {
    await clickPicker(page, 0.5, 0.5); // valid first
    await expect(page.getByTestId("picked-json")).toContainText('"lat"');
    await clickPicker(page, 0.02, 0.5); // far left edge: beyond the region box
    await expect(page.getByTestId("picker-error")).toHaveText(
      "That spot is outside the service area. Move the pin inside it.",
    );
    await expect(page.getByTestId("picked-json")).toHaveText("null");
    // Moving back inside clears it.
    await clickPicker(page, 0.5, 0.4);
    await expect(page.getByTestId("picker-error")).toHaveCount(0);
    await expect(page.getByTestId("picked-json")).toContainText('"lat"');
  });

  test("the pin can be dragged, and a drag outside the area is rejected", async ({ page }) => {
    await clickPicker(page, 0.5, 0.5);
    await page.getByTestId("picker-map").scrollIntoViewIfNeeded();
    const pin = page.locator("[data-picker-pin]");
    await expect(pin).toBeVisible();
    const box = (await pin.boundingBox())!;
    const map = (await page.getByTestId("picker-map").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(map.x + 10, map.y + map.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("picker-error")).toBeVisible();
    await expect(page.getByTestId("picked-json")).toHaveText("null");
  });

  test("the address is editable and flows into the value", async ({ page }) => {
    await clickPicker(page, 0.5, 0.5);
    const address = page.getByLabel("Address");
    await expect(address).toBeEnabled();
    await address.fill("Main Road, near Gate 2");
    await expect(page.getByTestId("picked-json")).toContainText("Main Road, near Gate 2");
  });

  test("never asks for the device location until the link is clicked", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 25.15, longitude: 75.85 });
    await page.addInitScript(() => {
      (window as unknown as { __geoCalls: number }).__geoCalls = 0;
      const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args) => {
        (window as unknown as { __geoCalls: number }).__geoCalls += 1;
        return real(...args);
      };
    });
    await open(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);

    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByTestId("picked-json")).toContainText("25.15");
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
  });

  test("a device location outside the service area is rejected too", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 28.6139, longitude: 77.209 }); // Delhi
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByTestId("picker-error")).toBeVisible();
    await expect(page.getByTestId("picked-json")).toHaveText("null");
  });

  test("a blocked device location explains what to do instead", async ({ page, context }) => {
    await context.clearPermissions();
    await context.grantPermissions([]);
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByText("Location is off or blocked. Search for the place or tap the map.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("signed-out search says plainly that it isn't available, and tapping the map still works", async ({ page }) => {
    await page.getByLabel("Location", { exact: true }).fill("gate");
    await expect(page.getByText(/Place search isn't available|Log in to continue/)).toBeVisible({ timeout: 10_000 });
    await clickPicker(page, 0.5, 0.5);
    await expect(page.getByTestId("picked-json")).toContainText('"lat"');
  });
});

test("map components pass axe at desktop and mobile", async ({ page }) => {
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(vp);
    await open(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(
      r.violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
      `${vp.width}`,
    ).toEqual([]);
  }
});

test("visual baselines: map page at desktop and mobile", async ({ page }) => {
  for (const vp of [
    { name: "desktop-1440x900", width: 1440, height: 900 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await open(page);
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot(`map-${vp.name}.png`, { fullPage: true });
  }
});
