// Playwright global setup: migrate and reset the TEST database, then start the worker
// (the API and web servers are started by playwright.config.ts `webServer`).
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const root = resolve(process.cwd(), "../..");
const win = process.platform === "win32";

export function loadRootEnv(): NodeJS.ProcessEnv {
  const file = resolve(root, ".env");
  const out: NodeJS.ProcessEnv = { ...process.env };
  if (existsSync(file)) {
    for (const [k, v] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (out[k] === undefined && v !== undefined) out[k] = v;
    }
  }
  return out;
}

/** Environment shared by the API and worker in e2e: the TEST database, capture mailer, own ports. */
export function e2eApiEnv(): NodeJS.ProcessEnv {
  const base = loadRootEnv();
  if (!base.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return {
    ...base,
    NODE_ENV: "development",
    DATABASE_URL: base.TEST_DATABASE_URL,
    PORT: "4100",
    APP_ORIGIN: "http://localhost:3101",
    API_ORIGIN: "http://localhost:4100",
    EMAIL_TRANSPORT: "capture",
    LOG_LEVEL: "warn",
    SKIP_DOTENV: "1",
  };
}

const pnpm = win ? "pnpm.cmd" : "pnpm";
let worker: ChildProcess | undefined;

export default async function globalSetup() {
  const env = e2eApiEnv();
  const opts = { cwd: root, env, stdio: "pipe" as const, shell: win };
  execFileSync(pnpm, ["--filter", "@saferstreets/api", "exec", "prisma", "migrate", "deploy"], opts);
  execFileSync(
    pnpm,
    ["--filter", "@saferstreets/api", "exec", "tsx", "--conditions=source", "scripts/e2e-reset.ts"],
    opts,
  );

  worker = spawn(pnpm, ["--filter", "@saferstreets/api", "exec", "tsx", "--conditions=source", "src/worker.ts"], {
    cwd: root,
    env: { ...env, ROLE: "worker" },
    stdio: "ignore",
    shell: win,
  });

  return async () => {
    if (!worker?.pid) return;
    if (win) {
      try {
        execFileSync("taskkill", ["/pid", String(worker.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* already gone */
      }
    } else worker.kill("SIGTERM");
  };
}
