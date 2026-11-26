// Shared e2e helpers: sign up through the real UI, reading the code from the capture mailer.
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = "http://localhost:4100";
export const unique = () => `e2e.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

export async function waitForTurnstile(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value,
    undefined,
    { timeout: 30_000 },
  );
}

export async function codeFor(request: APIRequestContext, email: string, since = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`${API}/api/v1/dev/captured-emails`, { params: { to: email } });
    const body = (await res.json()) as { data: Array<{ text: string; createdAt: string }> };
    const fresh = body.data.find((d) => new Date(d.createdAt).getTime() >= since);
    const m = fresh?.text.match(/log in code: (\d{6})/);
    if (m) return m[1]!;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no code arrived for ${email}`);
}

export async function register(page: Page, request: APIRequestContext, email: string, name = "Riya Sharma") {
  await page.goto("/login");
  await waitForTurnstile(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(await codeFor(request, email));
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel(/I am 18 or older/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
