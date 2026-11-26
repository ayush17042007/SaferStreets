// Flow 5.1 end to end: register -> onboarding -> dashboard -> profile, contact, sessions -> logout,
// using the capture mailer (the code is read back through the dev-only captured-emails endpoint).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://localhost:4100";
const unique = () => `e2e.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

async function waitForTurnstile(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value,
    undefined,
    { timeout: 30_000 },
  );
}

async function codeFor(request: APIRequestContext, email: string, since = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`${API}/api/v1/dev/captured-emails`, { params: { to: email } });
    const body = (await res.json()) as { data: Array<{ text: string; createdAt: string }> };
    // Only a code that arrived after `since`: an older, already used one must not be picked up.
    const fresh = body.data.find((d) => new Date(d.createdAt).getTime() >= since);
    const m = fresh?.text.match(/log in code: (\d{6})/);
    if (m) return m[1]!;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no code arrived for ${email}`);
}

async function requestCode(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  // The Turnstile token only appears once the page has hydrated, so wait for it before typing.
  await waitForTurnstile(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page).toHaveURL(/\/verify/);
}

/** The error alert (Next also renders a route announcer with role=alert). */
const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Backdates stored codes so the real 60 s resend cooldown has passed (dev endpoint, capture transport only). */
async function skipCooldown(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/api/v1/dev/expire-resend-cooldown`, {
    headers: { "x-requested-with": "XMLHttpRequest" },
    data: { email },
  });
  expect(res.ok()).toBe(true);
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(code);
}

async function register(page: Page, request: APIRequestContext, email: string, name = "Riya Sharma") {
  await requestCode(page, email);
  await typeCode(page, await codeFor(request, email));
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel(/I am 18 or older/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("flow 5.1: register, onboard, use, log out", () => {
  test("a new user registers, onboards, edits the profile, adds a contact and logs out", async ({ page, request }) => {
    const email = unique();

    // Gate: protected page sends a visitor to /login with a return path.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Log in or sign up" })).toBeVisible();

    await requestCode(page, email, "/dashboard");
    await expect(page.getByTestId("code-sent-to")).toHaveText(/Code sent to e\*\*\*@example\.test/);
    await typeCode(page, await codeFor(request, email));

    // New email: onboarding appears after the code, with the 18+ / terms checkbox.
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Confirm you are 18 or older and accept the terms.")).toBeVisible();
    await page.getByLabel("Full name").fill("Riya Sharma");
    await page.getByLabel(/I am 18 or older/).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Riya/ })).toBeVisible();

    // Profile: edit the name.
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Riya Sharma", level: 2 })).toBeVisible();
    await expect(page.getByText("Verified email")).toBeVisible();
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByLabel("Full name").fill("Riya S Sharma");
    await page.getByLabel("Phone").fill("9876543210");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Riya S Sharma", level: 2 })).toBeVisible();
    await expect(page.getByText("+919876543210")).toBeVisible();

    // Trusted contact: add one, consent required.
    await page.goto("/journeyguard/contacts");
    await expect(page.getByText("No trusted contacts yet")).toBeVisible();
    await page.getByRole("button", { name: "Add a contact" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Mom");
    await dialog.getByLabel("Email", { exact: true }).fill("mom@example.test");
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(dialog.getByText("Confirm you have told this person.")).toBeVisible();
    await dialog.getByLabel(/I have told this person/).check();
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("mom@example.test")).toBeVisible();
    await expect(page.getByText("1 of 5 saved.")).toBeVisible();

    // Your own email is refused.
    await page.getByRole("button", { name: "Add a contact" }).click();
    await dialog.getByLabel("Name").fill("Me");
    await dialog.getByLabel("Email", { exact: true }).fill(email);
    await dialog.getByLabel(/I have told this person/).check();
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(dialog.getByText("Use someone else's email, not your own.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Settings: sessions tab shows this device.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sessions" }).click();
    await expect(page.getByText("This device")).toBeVisible();
    // The Alert area tab is not offered until SafeAlert exists.
    await expect(page.getByRole("button", { name: "Alert area" })).toHaveCount(0);

    // Log out from the account menu; the app is gated again.
    await page.getByRole("button", { name: /Account menu for/ }).click();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("returning users skip onboarding and land on the page they asked for", async ({ page, request }) => {
    test.setTimeout(150_000);
    const email = unique();
    await register(page, request, email);
    await page.getByRole("button", { name: /Account menu for/ }).click();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);

    // A new code needs the resend cooldown to have passed.
    await skipCooldown(request, email);
    const since = Date.now();
    await requestCode(page, email, "/profile");
    await typeCode(page, await codeFor(request, email, since));
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("wrong codes count down, then lock; a fresh code is offered", async ({ page, request }) => {
    const email = unique();
    await requestCode(page, email);
    const real = await codeFor(request, email);
    const wrong = real === "000000" ? "111111" : "000000";

    await typeCode(page, wrong);
    await expect(alertOf(page)).toContainText("4 attempts left");
    await typeCode(page, wrong);
    await expect(alertOf(page)).toContainText("3 attempts left");
    await typeCode(page, wrong);
    await typeCode(page, wrong);
    await expect(alertOf(page)).toContainText("1 attempt left");
    await typeCode(page, wrong);
    await expect(alertOf(page)).toContainText("Too many wrong codes. Request a new one.");
    // Locked: the boxes stop taking input and a resend is offered.
    await expect(page.getByLabel("Digit 1 of 6")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
  });

  test("an unknown email gets the same screen as a known one (no account hints)", async ({ page }) => {
    await requestCode(page, unique());
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(/no account|not found|doesn't exist|sign up first/i)).toHaveCount(0);
  });

  test("log out everywhere ends the other device's session too", async ({ browser, request }) => {
    test.setTimeout(150_000);
    const email = unique();
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pa = await a.newPage();
    const pb = await b.newPage();
    await register(pa, request, email);
    // Second device logs in with the same account (needs a fresh code: wait out the cooldown).
    await skipCooldown(request, email);
    const since = Date.now();
    await requestCode(pb, email);
    await typeCode(pb, await codeFor(request, email, since));
    await expect(pb).toHaveURL(/\/dashboard$/);

    await pa.setViewportSize({ width: 1440, height: 900 });
    await pa.goto("/settings");
    await pa.getByRole("button", { name: "Sessions" }).click();
    await expect(pa.getByText("This device")).toBeVisible();
    await pa.getByRole("button", { name: "Log out everywhere" }).first().click();
    await pa.getByRole("dialog").getByRole("button", { name: "Log out everywhere" }).click();
    await expect(pa).toHaveURL(/\/login/);

    await pb.reload();
    await expect(pb).toHaveURL(/\/login/);
    await a.close();
    await b.close();
  });

  test("members get the 403 page on admin routes", async ({ page, request }) => {
    await register(page, request, unique());
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/403$/);
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  });

  test("onboarding is required before the app: a half-finished account is sent to /welcome", async ({
    page,
    request,
  }) => {
    const email = unique();
    await requestCode(page, email);
    await typeCode(page, await codeFor(request, email));
    await expect(page).toHaveURL(/\/welcome$/);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/welcome$/);
  });
});

test.describe("auth screens: visuals and accessibility", () => {
  const VIEWPORTS = [
    { name: "desktop-1440x900", width: 1440, height: 900 },
    { name: "tablet-768x1024", width: 768, height: 1024 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ] as const;

  for (const vp of VIEWPORTS) {
    test(`login and verify ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`login-${vp.name}.png`, { fullPage: true, mask: [page.locator("iframe")] });

      await requestCode(page, unique());
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`verify-${vp.name}.png`, {
        fullPage: true,
        mask: [page.locator("iframe"), page.getByTestId("code-sent-to")],
      });
    });
  }

  test("login has the A5.9 structure: card max 420, ink panel with the line, legal links", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    const card = page.locator("main > div");
    const box = (await card.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(420);
    await expect(page.getByRole("heading", { name: "Log in or sign up" })).toBeVisible();
    await expect(page.getByText("Light up every journey.")).toBeAttached();
    for (const l of ["Terms", "Privacy", "Safety disclaimer"])
      await expect(card.getByRole("link", { name: l })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator("aside").isVisible()).toBe(false);
  });

  test("login, verify and welcome pass axe at desktop and mobile", async ({ page, request }) => {
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto("/login");
      let r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .exclude("iframe")
        .analyze();
      expect(
        r.violations.map((v) => v.id),
        `login ${vp.width}`,
      ).toEqual([]);

      const email = unique();
      await requestCode(page, email);
      r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .exclude("iframe")
        .analyze();
      expect(
        r.violations.map((v) => v.id),
        `verify ${vp.width}`,
      ).toEqual([]);

      await typeCode(page, await codeFor(request, email));
      await expect(page).toHaveURL(/\/welcome$/);
      r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .exclude("iframe")
        .analyze();
      expect(
        r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
        `welcome ${vp.width}`,
      ).toEqual([]);
      await page.context().clearCookies();
    }
  });
});
