import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConfigError, parseEnv } from "../../src/config/env.js";

const API_DIR = fileURLToPath(new URL("../..", import.meta.url));

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_ORIGIN: "http://localhost:3000",
  API_ORIGIN: "http://localhost:4000",
  SESSION_SECRET: "s".repeat(32),
  OTP_HMAC_SECRET: "o".repeat(32),
};

describe("env module", () => {
  it("parses a valid env with defaults", () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({ NODE_ENV: "development", ROLE: "server", PORT: 4000, EMAIL_TRANSPORT: "capture" });
  });

  it("lists every problem without echoing values", () => {
    try {
      parseEnv({ ...valid, DATABASE_URL: "mysql://nope", SESSION_SECRET: "short-secret-value", ROLE: "cron" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as Error).message;
      expect(msg).toContain("DATABASE_URL");
      expect(msg).toContain("SESSION_SECRET");
      expect(msg).toContain("ROLE");
      expect(msg).not.toContain("short-secret-value");
    }
  });

  it("enforces production requirements", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(/EMAIL_TRANSPORT|EMAIL_FROM|TURNSTILE/);
    expect(() => parseEnv({ ...valid, EMAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  it("fails fast: the server process exits 1 on invalid config", () => {
    const env = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", SKIP_DOTENV: "1" };
    const res = spawnSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "tsx", "--conditions=source", "src/server.ts"],
      {
        cwd: API_DIR,
        env,
        encoding: "utf8",
        timeout: 60_000,
        shell: process.platform === "win32",
      },
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Invalid configuration");
    expect(res.stderr).toContain("DATABASE_URL");
  });
});
