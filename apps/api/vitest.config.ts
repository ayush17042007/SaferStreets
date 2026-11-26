import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadRootDotenv } from "./src/config/dotenv.ts";

loadRootDotenv();

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://saferstreets:saferstreets@localhost:5433/saferstreets_test";

// Tests truncate every table: never let them run against the development database.
if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_DATABASE_URL) {
  throw new Error("Refusing to run tests: TEST_DATABASE_URL must differ from DATABASE_URL.");
}

export default defineConfig({
  resolve: {
    alias: {
      "@saferstreets/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    setupFiles: ["test/setup.ts"],
    // One real Postgres test database, truncated between tests: run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      APP_ORIGIN: "http://localhost:3000",
      API_ORIGIN: "http://localhost:4000",
      // Test-only secrets (not used anywhere else).
      SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
      OTP_HMAC_SECRET: "test-otp-hmac-secret-0123456789abcdef012345678",
      EMAIL_TRANSPORT: "capture",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/index.ts"],
    },
  },
});
