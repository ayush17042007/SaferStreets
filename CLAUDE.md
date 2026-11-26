# SaferStreets: project rules (read every session)

## What this is

Web platform, 4 modules: SafeRoute (safety reports), AutoMate (shared autos), JourneyGuard (trusted-contact journeys), SafeAlert (community alerts), plus moderation/admin. India, campus-first. Light theme only (design system "Lamplight").

## Spec = source of truth (docs/spec/)

- docs/spec/INDEX.md maps every section to a file. Read ONLY the sections your prompt names.
- Visuals: A-design.md wins over everything. Backend/infra: B-backend.md wins over appendix-_.md. Features, rules, tables, endpoints, security: appendix-_.md.
- Anything unspecified: choose the safer, simpler option and log it under "Decisions" in docs/PROGRESS.md.

## Stack

- pnpm monorepo: apps/web (Next.js App Router, TypeScript, Tailwind, shadcn/Radix, React Hook Form + Zod, TanStack Query, MapLibre GL), apps/api (Express, TypeScript, Prisma, PostgreSQL, pg-boss, rate-limiter-flexible Postgres store, pino), packages/shared (Zod schemas, enums, types).
- Use pnpm and tsx only (no npm, yarn, ts-node). All scripts are package.json scripts that run on Windows PowerShell, macOS and Linux. No bash-only scripts.
- Same origin: Next.js rewrites /api/\* to Express. API entrypoints: server.ts (HTTP) and worker.ts (pg-boss jobs).

## Non-negotiables

- Honest scope: never build or claim live GPS tracking, automatic police/authority escalation, push notifications, payments, or guaranteed emergency delivery. Those are [FUTURE].
- No mock or placeholder data in shipped code. Real DB, real endpoints. Demo data only via the seed script.
- Authorization is deny-by-default and enforced in services. Never trust client-sent user IDs. Responses depend on the viewer (phones only for ride members, guests get limited projections).
- Never log or return other users' emails/phones, OTPs, session tokens.
- Business rules live in services, not controllers. Racing mutations use transactions + row locks. Jobs are idempotent with retries.
- Validate with shared Zod schemas. Errors use the single error model (appendix-07 7.2 + requestId).

## UI rules (Part A)

- Tokens only. No hex values outside the token file. No Tailwind default palette colours in components.
- Core tokens: ink #111A3B, cream #FAF7F2, card #FFFFFF, line #E8E3D9, amber #FFB020, mint #19C39A, periwinkle #6C63FF, coral #FF5A5F (icons/fills only, never small text), emergency-solid #D92D3A. Full list: A-design.md A2.
- Fonts: Plus Jakarta Sans (headings, numbers), Inter (body/UI). Icons: Tabler outline (@tabler/icons-react) only.
- Radii: chips 999, controls 12, cards 16, hero/ink panels 20-24. Default cards flat with 1px line border.
- Never small white text on coral or amber. Red only for emergencies and destructive actions. Status never by colour alone.
- Copy: sentence case, calm, no exclamation marks, avoid "successfully / please / simply / just". Always label unverified content "Unverified".
- Light theme only. Keep tokens structured so dark can be added later.

## Workflow

- Plan, build, verify. Architecture-heavy prompts: write a short plan and sanity-check it before coding.
- Before finishing: pnpm typecheck, pnpm lint, pnpm test must pass. Never report untested work as done.
- UI work ends with the visual QA loop: Playwright screenshots of each touched screen at 1440x900, 768x1024, 390x844 (store in docs/qa/<prompt>/), compare to Part A, list deviations, fix, re-shoot once. Unresolved deviations go under "Design deviations" in docs/PROGRESS.md.
- Small, well-named commits (conventional style). Never edit an applied Prisma migration.
- docs/PROGRESS.md (max 15 lines: done / next / known issues) plus sections "Decisions" and "Design deviations". Update it every prompt.
- Final report: max 10 lines. No restating the task.
- Ask questions only when truly blocked. Otherwise decide and log it.

## Testing

- Vitest + Supertest on a real test Postgres (never mock the DB). Playwright for E2E, visual regression and screenshots. axe for a11y.
- Services/utilities coverage >= 80%. Permission and IDOR suites cover every route.
- Safety-critical jobs are tested with an injected clock.
