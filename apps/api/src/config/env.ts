// The single validated env module (Part B1). The app fails fast on invalid config.
import { z } from "zod";
import { loadRootDotenv } from "./dotenv.js";

const secret = z.string().min(32, "must be at least 32 characters");
const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    ROLE: z.enum(["server", "worker"]).default("server"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.url().refine((u) => /^postgres(ql)?:\/\//.test(u), "must be a postgres:// URL"),
    APP_ORIGIN: z.url(),
    API_ORIGIN: z.url(),
    SESSION_SECRET: secret,
    OTP_HMAC_SECRET: secret,
    EMAIL_TRANSPORT: z.enum(["resend", "smtp", "capture"]).default("capture"),
    EMAIL_FROM: optional,
    RESEND_API_KEY: optional,
    RESEND_WEBHOOK_SECRET: optional,
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    TURNSTILE_SITE_KEY: optional,
    TURNSTILE_SECRET_KEY: optional,
    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    MAPTILER_KEY: optional,
    OPENROUTESERVICE_API_KEY: optional,
    ROUTING_API_URL: optional,
    SENTRY_DSN_API: optional,
    /** Request timeout in ms (Part B1). */
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
    /** JSON body limit (Part B1). Uploads go direct to storage, so bodies stay small. */
    BODY_LIMIT: z.string().default("100kb"),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, why: string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `required ${why}` });
    };
    if (env.EMAIL_TRANSPORT === "resend") need("RESEND_API_KEY", "when EMAIL_TRANSPORT=resend");
    if (env.NODE_ENV === "production") {
      if (env.EMAIL_TRANSPORT === "capture")
        ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "capture is not allowed in production" });
      need("EMAIL_FROM", "in production");
      need("TURNSTILE_SECRET_KEY", "in production");
    }
  });

export type Env = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/** Parse an env object. Throws ConfigError listing every problem (never the values). */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return result.data;
}

let cached: Env | undefined;

/** Load and validate process.env once. On failure, print the problems and exit(1). */
export function loadEnv(): Env {
  if (cached) return cached;
  loadRootDotenv();
  try {
    cached = parseEnv(process.env);
    return cached;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
