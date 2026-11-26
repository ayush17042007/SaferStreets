// HTTP entrypoint (Part B1). `ROLE=server node dist/index.js` or `tsx src/server.ts`.
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { loadEnv, type Env } from "./config/env.js";
import { systemClock } from "./lib/clock.js";
import { createPgBossPublisher } from "./jobs/publisher.js";
import { createTurnstileVerifier } from "./modules/auth/turnstile.js";
import { createMapTilerClient } from "./modules/geo/geo.client.js";
import { createRoutingClient } from "./modules/geo/routing.client.js";
import { createCloudinaryClient } from "./modules/uploads/cloudinary.js";
import { createRuntime, isEntry, onShutdown } from "./runtime.js";

/** Cloudflare published test secret (always passes). Used only outside production; production requires a real one. */
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function startServer(env: Env): Promise<Server> {
  const rt = createRuntime(env);
  const publisher = await createPgBossPublisher({ connectionString: env.DATABASE_URL, log: rt.logger });
  const turnstile = createTurnstileVerifier({
    secret: env.TURNSTILE_SECRET_KEY ?? (env.NODE_ENV === "production" ? "" : TURNSTILE_TEST_SECRET),
  });
  const { app } = createApp({
    ...rt,
    clock: systemClock,
    publisher,
    turnstile,
    cloudinary: createCloudinaryClient(env),
    geo: createMapTilerClient(env.MAPTILER_KEY),
    routing: createRoutingClient({
      openRouteServiceKey: env.OPENROUTESERVICE_API_KEY,
      osrmUrl: env.ROUTING_API_URL,
    }),
  });
  const server = app.listen(env.PORT, () => rt.logger.info({ port: env.PORT }, "api listening"));
  server.requestTimeout = env.REQUEST_TIMEOUT_MS + 5000;
  server.headersTimeout = 20_000;

  onShutdown(rt.logger, async () => {
    // Stop accepting connections, let in-flight requests finish, then close the database.
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await publisher.close();
    await rt.prisma.$disconnect();
    await rt.pool.end();
  });
  setImmediate(() => server.closeIdleConnections());
  return server;
}

if (isEntry(import.meta.url)) {
  void startServer(loadEnv());
}
