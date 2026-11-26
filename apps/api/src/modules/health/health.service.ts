// Readiness (Part B5): DB reachable, every migration on disk applied, worker heartbeat < 3 min old.
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ReadyResponse } from "@saferstreets/shared";
import { REPO_ROOT } from "../../config/dotenv.js";
import type { Clock } from "../../lib/clock.js";
import type { Logger } from "../../lib/logger.js";
import type { HealthRepository } from "./health.repository.js";

export const HEARTBEAT_NAME = "scheduler";
export const HEARTBEAT_MAX_AGE_MS = 3 * 60 * 1000;
export const MIGRATIONS_DIR = resolve(REPO_ROOT, "apps/api/prisma/migrations");
const CHECK_TIMEOUT_MS = 2000;

export function migrationsOnDisk(dir = MIGRATIONS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("check timed out")), CHECK_TIMEOUT_MS).unref()),
  ]);
}

export function createHealthService(deps: {
  repo: HealthRepository;
  clock: Clock;
  log: Logger;
  migrations?: string[];
}) {
  const expected = deps.migrations ?? migrationsOnDisk();

  return {
    async ready(): Promise<ReadyResponse> {
      const checks: ReadyResponse["checks"] = { database: "fail", migrations: "fail", worker: "fail" };
      try {
        await withTimeout(deps.repo.ping());
        checks.database = "ok";
      } catch (err) {
        deps.log.warn({ err }, "readiness: database check failed");
      }
      if (checks.database === "ok") {
        try {
          const applied = new Set(await withTimeout(deps.repo.appliedMigrations()));
          checks.migrations = expected.length > 0 && expected.every((m) => applied.has(m)) ? "ok" : "fail";
        } catch (err) {
          deps.log.warn({ err }, "readiness: migrations check failed");
        }
        try {
          const last = await withTimeout(deps.repo.heartbeat(HEARTBEAT_NAME));
          const age = last ? deps.clock.now().getTime() - last.getTime() : Infinity;
          checks.worker = age < HEARTBEAT_MAX_AGE_MS ? "ok" : "fail";
        } catch (err) {
          deps.log.warn({ err }, "readiness: heartbeat check failed");
        }
      }
      const ok = Object.values(checks).every((c) => c === "ok");
      return { status: ok ? "ok" : "unavailable", checks };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
