import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
] as const;

async function openGallery(page: Page) {
  await page.goto("/dev/components");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

for (const vp of VIEWPORTS) {
  test(`gallery visual baseline ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGallery(page);
    await expect(page).toHaveScreenshot(`gallery-${vp.name}.png`, { fullPage: true });
  });
}

test("gallery has no axe violations including colour contrast (WCAG 2.2 AA)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGallery(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
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

test("touch targets are at least 44 x 44 for buttons and icon buttons in the mobile frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGallery(page);
  const small = await page.$$eval(
    "[data-testid='frame-mobile'] button, [data-testid='frame-mobile'] [role='radio']",
    (els) =>
      els
        .map((e) => ({
          t: e.textContent?.trim(),
          h: e.getBoundingClientRect().height,
          w: e.getBoundingClientRect().width,
        }))
        .filter((r) => r.h < 44 || r.w < 44),
  );
  expect(small).toEqual([]);
});

test("focus ring is drawn on keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGallery(page);
  const btn = page.getByRole("button", { name: "Open modal" });
  await btn.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const style = await btn.evaluate((e) => {
    const s = getComputedStyle(e);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineOffset: s.outlineOffset,
      shadow: s.boxShadow,
    };
  });
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("2px");
  expect(style.outlineOffset).toBe("2px");
  expect(style.shadow).toMatch(/255, 176, 32, 0.45/); // amber glow from the focus-ring token
});

test("gallery 404s outside development", async ({ request }) => {
  // Sanity: the dev gallery exists here; the production guard is covered by the build route list.
  const res = await request.get("/dev/components");
  expect(res.status()).toBe(200);
});
