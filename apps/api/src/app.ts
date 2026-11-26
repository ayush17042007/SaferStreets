// Express app factory. Order: request id -> logging -> security headers -> timeout -> body
// limit -> session lookup -> CSRF -> general rate limit -> routes -> 404 -> error handler.
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Pool } from "pg";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import { mountRoutes } from "./http/routes.js";
import type { Clock } from "./lib/clock.js";
import type { Logger } from "./lib/logger.js";
import type { PrismaClient } from "./lib/prisma.js";
import { attachSession } from "./middleware/auth.js";
import { csrfGuard } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { createRateLimiters, rateLimit, type RateLimiters } from "./middleware/rateLimit.js";
import { requestId } from "./middleware/requestId.js";
import { requestTimeout } from "./middleware/timeout.js";
import { createHealthRepository } from "./modules/health/health.repository.js";
import { HEALTH_MOUNTS, healthRoutes } from "./modules/health/health.routes.js";
import { createHealthService } from "./modules/health/health.service.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { setSessionCookie } from "./modules/auth/session.js";
import type { TurnstileVerifier } from "./modules/auth/turnstile.js";
import { devRoutes } from "./modules/dev/dev.routes.js";
import { createEmailService } from "./modules/mail/email.service.js";
import type { GeoClient } from "./modules/geo/geo.client.js";
import type { RoutingClient } from "./modules/geo/routing.client.js";
import { createGeoService } from "./modules/geo/geo.service.js";
import { geoRoutes } from "./modules/geo/geo.routes.js";
import { publicRoutes } from "./modules/public/public.routes.js";
import type { CloudinaryClient } from "./modules/uploads/cloudinary.js";
import { createUploadsService } from "./modules/uploads/uploads.service.js";
import { uploadsRoutes } from "./modules/uploads/uploads.routes.js";
import { createDashboardService } from "./modules/dashboard/dashboard.service.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { createFlagsService } from "./modules/flags/flags.service.js";
import { flagsRoutes } from "./modules/flags/flags.routes.js";
import { createNotificationService } from "./modules/notifications/notifications.service.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { createAlertsService } from "./modules/alerts/alerts.service.js";
import { alertsRoutes } from "./modules/alerts/alerts.routes.js";
import { createJourneysService } from "./modules/journeys/journeys.service.js";
import { journeysRoutes } from "./modules/journeys/journeys.routes.js";
import { createRidesService } from "./modules/rides/rides.service.js";
import { ridesRoutes } from "./modules/rides/rides.routes.js";
import { createReportsService } from "./modules/reports/reports.service.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { createUsersService } from "./modules/users/users.service.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import type { JobPublisher } from "./jobs/publisher.js";
import { createSettingsRepository } from "./modules/settings/settings.repository.js";
import { createSettingsService, type SettingsService } from "./modules/settings/settings.service.js";
import { createSosService } from "./modules/sos/sos.service.js";
import { sosRoutes } from "./modules/sos/sos.routes.js";
import { buildOpenApiDocument, createRegistry } from "./openapi/document.js";

export const API_BASE = "/api/v1";

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  pool: Pool;
  logger: Logger;
  clock: Clock;
  publisher: JobPublisher;
  turnstile: TurnstileVerifier;
  /** Null when no MapTiler key is set: place search answers 503. */
  geo: GeoClient | null;
  /** Null when no routing provider is configured: route comparison answers 503. */
  routing?: RoutingClient | null;
  /** Null when Cloudinary is not configured: uploads answer 503. */
  cloudinary: CloudinaryClient | null;
  /** Tests may inject limiters with small budgets. */
  limiters?: RateLimiters;
  /** Mount extra routes before the 404 handler (used by tests to exercise middleware). */
  extend?: (app: Express, registry: OpenAPIRegistry) => void;
}

export interface AppBundle {
  app: Express;
  registry: OpenAPIRegistry;
  settings: SettingsService;
  limiters: RateLimiters;
  openapi: () => ReturnType<typeof buildOpenApiDocument>;
}

const isHealthPath = (path: string) => /^(\/api)?\/health\//.test(path);

export function createApp(deps: AppDeps): AppBundle {
  const { env, prisma, pool, logger, clock } = deps;
  const app = express();
  const registry = createRegistry();
  const limiters = deps.limiters ?? createRateLimiters(pool);

  app.disable("x-powered-by");
  // One proxy hop (Next.js rewrite or the platform load balancer) so req.ip is the client.
  app.set("trust proxy", 1);
  app.set("query parser", "simple");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      customProps: (req) => ({ userId: (req as express.Request).auth?.userId }),
      autoLogging: { ignore: (req) => isHealthPath(req.url ?? "") },
    }),
  );
  app.use(helmet());
  app.use(requestTimeout(env.REQUEST_TIMEOUT_MS));
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(
    attachSession({
      prisma,
      sessionSecret: env.SESSION_SECRET,
      clock,
      refreshCookie: (res, token, expires) => setSessionCookie(res, env, token, expires),
    }),
  );
  app.use(csrfGuard({ allowedOrigins: [env.APP_ORIGIN, env.API_ORIGIN] }));
  app.use(rateLimit(limiters.general, "user", { skip: (req) => isHealthPath(req.path) }));

  // --- routes ---
  const health = createHealthService({ repo: createHealthRepository(prisma), clock, log: logger });
  for (const base of HEALTH_MOUNTS) mountRoutes(app, registry, base, healthRoutes(health));

  const settings = createSettingsService({ repo: createSettingsRepository(prisma), clock, log: logger });
  mountRoutes(app, registry, API_BASE, publicRoutes(settings));

  const email = createEmailService({ prisma, publisher: deps.publisher, env });
  const authService = createAuthService({ prisma, env, clock, email, turnstile: deps.turnstile, log: logger });
  mountRoutes(app, registry, API_BASE, authRoutes({ service: authService, env, limiters }));
  mountRoutes(
    app,
    registry,
    API_BASE,
    geoRoutes({ service: createGeoService({ client: deps.geo, settings, log: logger }), limiters }),
  );
  const uploads = createUploadsService({ prisma, clock, cloudinary: deps.cloudinary });
  mountRoutes(app, registry, API_BASE, uploadsRoutes(uploads));
  const users = createUsersService({ prisma, clock, uploads });
  mountRoutes(app, registry, API_BASE, usersRoutes({ service: users, env }));
  mountRoutes(app, registry, API_BASE, dashboardRoutes(createDashboardService({ prisma, clock, settings })));
  const notifications = createNotificationService({ prisma, email, env });
  mountRoutes(app, registry, API_BASE, notificationsRoutes(notifications));
  const sos = createSosService({ prisma, clock, notifications });
  mountRoutes(app, registry, API_BASE, sosRoutes({ service: sos, prisma, clock, limiters }));
  const reports = createReportsService({ prisma, clock, settings, uploads, notifications });
  mountRoutes(app, registry, API_BASE, reportsRoutes({ service: reports, prisma, clock, limiters, routing: deps.routing ?? null }));
  mountRoutes(
    app,
    registry,
    API_BASE,
    ridesRoutes({ service: createRidesService({ prisma, clock, notifications }), prisma, clock, limiters }),
  );
  mountRoutes(
    app,
    registry,
    API_BASE,
    journeysRoutes({
      service: createJourneysService({ prisma, clock, email, env, log: logger }),
      prisma,
      clock,
      limiters,
    }),
  );
  mountRoutes(
    app,
    registry,
    API_BASE,
    alertsRoutes({
      service: createAlertsService({ prisma, clock, settings, notifications, publisher: deps.publisher }),
      prisma,
      clock,
      limiters,
    }),
  );
  mountRoutes(app, registry, API_BASE, adminRoutes(createAdminService({ prisma, clock, settings })));
  mountRoutes(app, registry, API_BASE, flagsRoutes({ service: createFlagsService({ prisma }), limiters }));
  if (env.EMAIL_TRANSPORT === "capture" && env.NODE_ENV !== "production") {
    mountRoutes(app, registry, API_BASE, devRoutes(prisma));
  }

  const openapi = () => buildOpenApiDocument(registry);
  if (env.NODE_ENV !== "production") {
    // Admin-only access in production arrives with admin auth (Prompt 10).
    app.get("/api/docs", (_req, res) => {
      res.json(openapi());
    });
  }

  deps.extend?.(app, registry);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, registry, settings, limiters, openapi };
}
