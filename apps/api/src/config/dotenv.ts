// Loads <repo>/.env into process.env without overriding variables that are already set.
// Real deployments set env vars directly; the file is a local-development convenience.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function loadRootDotenv(file = resolve(REPO_ROOT, ".env")): void {
  if (process.env.SKIP_DOTENV === "1" || !existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined && v !== undefined) process.env[k] = v;
  }
}
