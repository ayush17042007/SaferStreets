import { defineConfig } from "@playwright/test";
import { e2eApiEnv, loadRootEnv } from "./e2e/global-setup";

const WEB_PORT = 3101;
const API_PORT = 4100;
const api = e2eApiEnv();
const root = loadRootEnv();
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// Visual baselines, axe and the auth flow. The API and worker run against the TEST database with
// the capture mailer; the web app proxies /api to the API on its own port. Turnstile uses
// Cloudflare's published test keys (needs network access to challenges.cloudflare.com).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: { baseURL: `http://localhost:${WEB_PORT}`, colorScheme: "light", reducedMotion: "reduce" },
  webServer: [
    {
      command: `${pnpm} --filter @saferstreets/api exec tsx --conditions=source src/server.ts`,
      cwd: "../..",
      url: `http://localhost:${API_PORT}/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: api as Record<string, string>,
    },
    {
      command: `${pnpm} exec next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...(root as Record<string, string>),
        API_ORIGIN: `http://localhost:${API_PORT}`,
        APP_ORIGIN: `http://localhost:${WEB_PORT}`,
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
