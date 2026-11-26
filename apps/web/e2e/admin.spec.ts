import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { e2eApiEnv } from "./global-setup";
import { register, unique } from "./helpers";

const root = resolve(process.cwd(), "../..");
const shots = resolve(root, "docs/qa/m5");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/** Promote and/or notify a user directly in the TEST database (the script refuses any other database). */
function prepare(email: string, extra: string[]) {
  execFileSync(
    pnpm,
    [
      "--filter",
      "@saferstreets/api",
      "exec",
      "tsx",
      "--conditions=source",
      "scripts/e2e-prepare-user.ts",
      "--email",
      email,
      ...extra,
    ],
    { cwd: root, env: e2eApiEnv(), stdio: "pipe", shell: process.platform === "win32" },
  );
}

async function shoot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  for (const [tag, w, h] of [
    ["1440", 1440, 900],
    ["390", 390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.screenshot({ path: resolve(shots, `${name}-${tag}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe("Admin and notification centre (M5)", () => {
  test("staff reach the admin pages, members are blocked, notifications can be read", async ({
    page,
    request,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // A regular member: no Admin nav item, /admin gets the 403 page.
    const memberEmail = unique();
    await register(page, request, memberEmail, "Meera Joshi");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/403$/);
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();

    // The member gets one unread notification and clears it with "Mark all read".
    prepare(memberEmail, ["--notify"]);
    await page.goto("/notifications");
    await expect(page.getByTestId("notification")).toHaveCount(1);
    await expect(page.getByTestId("notification").getByText("Unread", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await shoot(page, "notifications");
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByTestId("notification").getByText("Unread", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(page.getByText("You're all caught up")).toBeVisible();

    // An admin sees the overview, the queue and the users list.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.setViewportSize({ width: 1440, height: 900 });
    const adminEmail = unique();
    await register(adminPage, request, adminEmail, "Arjun Verma");
    prepare(adminEmail, ["--role", "ADMIN"]);

    await adminPage.goto("/dashboard");
    await adminPage.getByRole("link", { name: "Admin", exact: true }).first().click();
    await expect(adminPage).toHaveURL(/\/admin$/);
    await expect(adminPage.getByRole("heading", { name: "Admin overview" })).toBeVisible();
    await expect(adminPage.getByTestId("stat-usersTotal")).toBeVisible();
    await shoot(adminPage, "admin");

    await adminPage.getByRole("link", { name: "Moderation", exact: true }).click();
    await expect(adminPage.getByRole("heading", { name: "Moderation queue" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Reports" })).toBeVisible();
    await shoot(adminPage, "admin-queue");

    await adminPage.getByRole("link", { name: "Users", exact: true }).click();
    await expect(adminPage.getByTestId("user-row").first()).toBeVisible();
    await expect(adminPage.getByText("Arjun Verma").first()).toBeVisible();
    await expect(adminPage.getByText(adminEmail)).toHaveCount(0); // emails are masked
    await shoot(adminPage, "admin-users");

    await adminPage.getByRole("link", { name: "Audit log", exact: true }).click();
    await expect(adminPage.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await adminCtx.close();
  });
});
