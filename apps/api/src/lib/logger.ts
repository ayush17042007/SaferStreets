// pino JSON logger (Part B6). Emails, phones, tokens, OTPs, cookies and secrets are redacted.
import { pino, type Logger, type LoggerOptions } from "pino";

const SENSITIVE_KEYS = [
  "email",
  "to",
  "phone",
  "token",
  "sessionToken",
  "trackToken",
  "otp",
  "code",
  "codeHash",
  "tokenHash",
  "password",
  "secret",
  "apiKey",
  "turnstileToken",
];

/** Redaction paths for a key at the top level and up to three levels deep. */
function deep(key: string): string[] {
  return [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`];
}

export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap(deep),
];

export function createLogger(opts: { level: string; pretty?: boolean } & LoggerOptions = { level: "info" }): Logger {
  const { pretty, ...rest } = opts;
  return pino({
    ...rest,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  });
}

export type { Logger };
