// Shared process wiring for server.ts and worker.ts: env, logger, database, graceful shutdown.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";
import type { Env } from "./config/env.js";
import { createLogger, type Logger } from "./lib/logger.js";
import { createPrisma, type PrismaClient } from "./lib/prisma.js";

export interface Runtime {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  pool: pg.Pool;
}

export function createRuntime(env: Env): Runtime {
  const logger = createLogger({
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === "development" && process.stdout.isTTY,
  });
  const prisma = createPrisma(env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
  pool.on("error", (err) => logger.error({ err }, "pg pool error"));
  return { env, logger, prisma, pool };
}

/** Run `stop` once on SIGINT/SIGTERM; force-exit if it takes longer than `graceMs`. */
export function onShutdown(logger: Logger, stop: () => Promise<void>, graceMs = 15_000): void {
  let stopping = false;
  const handler = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    const force = setTimeout(() => {
      logger.error("graceful shutdown timed out, exiting");
      process.exit(1);
    }, graceMs);
    force.unref();
    stop()
      .then(() => {
        logger.info("shutdown complete");
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, "shutdown failed");
        process.exit(1);
      });
  };
  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}

/** True when this module is the process entry (node dist/server.js or tsx src/server.ts). */
export function isEntry(metaUrl: string): boolean {
  const entry = process.argv[1];
  return !!entry && resolve(entry) === fileURLToPath(metaUrl);
}
