// Shared test utilities. Everything runs against the real test Postgres (never mocked).
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import pg from "pg";
import { createApp, type AppDeps } from "../src/app.js";
import { parseEnv, type Env } from "../src/config/env.js";
import type { RateLimitName, RateLimitRule } from "../src/config/rateLimits.js";
import { systemClock, type Clock } from "../src/lib/clock.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.js";
import { SESSION_COOKIE, hashSessionToken } from "../src/middleware/auth.js";
import { createRateLimiters } from "../src/middleware/rateLimit.js";
import { createInlinePublisher, type JobPublisher } from "../src/jobs/publisher.js";
import { sendEmailJob } from "../src/jobs/handlers/emailSend.js";
import { createCaptureMailer } from "../src/modules/mail/mailer.js";
import type { TurnstileVerifier } from "../src/modules/auth/turnstile.js";
import type { GeoClient } from "../src/modules/geo/geo.client.js";
import type { RoutingClient } from "../src/modules/geo/routing.client.js";
import type { CloudinaryClient } from "../src/modules/uploads/cloudinary.js";
import { JOB_NAMES } from "../src/jobs/registry.js";
import type { EmailJobData } from "../src/modules/mail/email.service.js";

export const env: Env = parseEnv(process.env);
export const prisma: PrismaClient = createPrisma(env.DATABASE_URL);
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
export const silentLogger = createLogger({ level: "silent" });

/** Truncate every application table (keeps _prisma_migrations). */
export async function truncateAll(): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  if (rows.length === 0) return;
  await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export interface TestAppOptions {
  clock?: Clock;
  limits?: Partial<Record<RateLimitName, RateLimitRule>>;
  extend?: (app: Express, registry: OpenAPIRegistry) => void;
  env?: Partial<Env>;
  turnstile?: TurnstileVerifier;
  cloudinary?: CloudinaryClient | null;
  geo?: GeoClient | null;
  routing?: RoutingClient | null;
  publisher?: JobPublisher;
}

/** Runs email.send inline against the capture mailer, so tests can read the code that was "sent". */
export function inlineEmailPublisher() {
  const mailer = createCaptureMailer(prisma);
  return createInlinePublisher(async (name, data) => {
    if (name !== JOB_NAMES.emailSend) return;
    await sendEmailJob(
      data as EmailJobData,
      { prisma, log: silentLogger, clock: systemClock, isLastAttempt: true },
      { mailer, secret: env.OTP_HMAC_SECRET },
    );
  });
}

export function buildTestApp(opts: TestAppOptions = {}) {
  const deps: AppDeps = {
    env: { ...env, ...opts.env },
    prisma,
    pool,
    logger: silentLogger,
    clock: opts.clock ?? systemClock,
    publisher: opts.publisher ?? inlineEmailPublisher(),
    turnstile: opts.turnstile ?? { verify: async () => true },
    cloudinary: opts.cloudinary === undefined ? null : opts.cloudinary,
    geo: opts.geo === undefined ? null : opts.geo,
    routing: opts.routing === undefined ? null : opts.routing,
    limiters: createRateLimiters(pool, opts.limits),
    ...(opts.extend ? { extend: opts.extend } : {}),
  };
  return createApp(deps);
}

/** Headers every state-changing request from the web app carries (Part B2). */
export const xhr = { "X-Requested-With": "XMLHttpRequest" };

export async function createUser(
  data: Partial<{
    role: "USER" | "MODERATOR" | "ADMIN";
    status: "ACTIVE" | "SUSPENDED" | "BANNED";
    email: string;
  }> = {},
) {
  return prisma.user.create({
    data: {
      email: data.email ?? `user-${randomBytes(6).toString("hex")}@example.test`,
      fullName: "Test User",
      role: data.role ?? "USER",
      status: data.status ?? "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

/** Creates a user plus a live session; returns the Cookie header value to send. */
export async function createUserWithSession(...args: Parameters<typeof createUser>) {
  const user = await createUser(...args);
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(env.SESSION_SECRET, token),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}
