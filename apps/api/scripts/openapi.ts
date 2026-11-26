// Writes apps/api/openapi.json from the registered routes. The contract test fails if the
// committed file drifts from what the code generates. Does not connect to the database.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createApp } from "../src/app.ts";
import { parseEnv } from "../src/config/env.ts";
import { systemClock } from "../src/lib/clock.ts";
import { createLogger } from "../src/lib/logger.ts";
import { createInlinePublisher } from "../src/jobs/publisher.ts";
import { createPrisma } from "../src/lib/prisma.ts";

// Placeholders only: nothing here opens a connection.
const env = parseEnv({
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://openapi:openapi@localhost:5432/openapi",
  APP_ORIGIN: "http://localhost:3000",
  API_ORIGIN: "http://localhost:4000",
  SESSION_SECRET: "x".repeat(32),
  OTP_HMAC_SECRET: "x".repeat(32),
});
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const { openapi } = createApp({
  env,
  prisma: createPrisma(env.DATABASE_URL),
  pool,
  logger: createLogger({ level: "silent" }),
  clock: systemClock,
  publisher: createInlinePublisher(),
  turnstile: { verify: async () => true },
  cloudinary: null,
  geo: null,
});

const out = fileURLToPath(new URL("../openapi.json", import.meta.url));
writeFileSync(out, `${JSON.stringify(openapi(), null, 2)}\n`);
await pool.end();
console.log(`wrote ${out}`);
