# Prompt 1 plan: backend foundation

## Folder layout

```
apps/api/            Express 5 + Prisma 7 (adapter-pg) + pg-boss 12, ESM, tsc -> dist
  prisma/schema.prisma, prisma/migrations/, prisma.config.ts
  src/index.ts       ROLE=server|worker -> server.ts / worker.ts (one build)
  src/config/env.ts  zod env, fail fast (exit 1, readable message)
  src/app.ts         createApp(deps): requestId -> pino-http -> helmet -> body limit -> timeout
                     -> origin/X-Requested-With check -> general rate limit -> routes -> 404 -> error handler
  src/lib/           prisma, logger (redaction), errors (AppError + Prisma mapping), pagination (cursor), hash, clock
  src/middleware/    requestId, auth (requireAuth/requireRole), validate, rateLimit, idempotency, timeout, csrf, error
  src/modules/       health/, settings/ (system_settings service + repository); business modules arrive later
  src/jobs/          registry (typed names, retry/backoff/DLQ, logging wrapper), boss.ts, handlers/heartbeat.ts
  src/openapi/       zod-to-openapi registry + document builder, served at /api/docs (non-prod)
  test/              Vitest + Supertest on TEST_DATABASE_URL (global setup: migrate deploy; per-test TRUNCATE)
apps/web/            Next 16 App Router, Tailwind 4 installed, rewrites /api/:path* -> API_ORIGIN/api/:path*
packages/shared/     enums, error codes, pagination types, zod schema skeleton per module
```

## Schema decisions

- Every 6.2 table + B4 tables; `rate_limits` table for rate-limiter-flexible (pre-created, so Prisma owns it and no runtime DDL).
- UUID PKs `gen_random_uuid()`, `timestamptz`, `citext` for emails (extension created at the top of migration 1), `created_at`/`updated_at` everywhere (B4).
- FK indexes are declared in schema.prisma (`@@index`) so Prisma tracks them; a pg_catalog test asserts every FK has a covering index.
- CHECKs, the journeys partial UNIQUE and the append-only trigger on `moderation_actions` are raw SQL appended to the `--create-only` migration. Prisma ignores CHECKs/triggers in diffs; partial index drift is checked with `migrate diff` before applying.
- `journeys.emergency_contact_id` nullable with ON DELETE SET NULL (required in the API) so deleting a contact doesn't block on journey history.
- Cascades only on owned child rows (contacts, sessions, photos, confirmations, history, votes, events, participants, notifications); content FKs restrict (accounts are soft-deleted).

## Job framework

- pg-boss schema `pgboss`, started only in worker.ts. `defineJob({ name, schedule?, tz?, retryLimit, retryDelay, retryBackoff, handler })`; each queue gets `<name>.dlq` as its dead-letter queue.
- Handlers take `{ prisma, log, now }` (injected clock) and must be idempotent; the wrapper logs start/ok/fail with job id.
- Only job now: `scheduler.heartbeat` every minute (+ once at boot) upserting `heartbeats(name='scheduler')`.

## Test strategy

- One real Postgres test DB, files run sequentially. Covers: error model + requestId, validation (strip/trim), idempotency (replay, 422 mismatch, 409 in-flight), rate limit (429 + Retry-After), cursor helper, health live/ready (503 on stale heartbeat), config fail-fast (spawned process), heartbeat job (direct + through pg-boss), schema catalog (tables, CHECKs, partial unique, FK indexes), OpenAPI contract (routes vs spec both ways), shared enums == Prisma enums.

## Sanity check against the spec

- 0.4: pg-boss worker, rate-limiter-flexible Postgres, same origin, cursor pagination: all covered. Turnstile is Prompt 4/12.
- B1 layers + fail fast + graceful shutdown + timeouts + body limits: covered. B2 cookie/CSRF: `X-Requested-With` + Origin check now; cookie issued in Prompt 4.
- B4 tables: all present incl. `ride_waitlist` [OPT] and `version` columns. B5: Idempotency-Key, cursor, OpenAPI 3.1, health, error model + requestId, Retry-After.
- B6: pino redaction of emails, phones, tokens, OTPs, cookies. 7.2 codes kept; added IDEMPOTENCY_MISMATCH 422, PAYLOAD_TOO_LARGE 413, SERVICE_UNAVAILABLE 503 (logged).
- Appendix 9 rate-limit table encoded as config; "3 open rides" is a count rule enforced in the rides service later, not a rate limit.
