# Progress

**Done**

- P0-P3: spec split, backend foundation, Lamplight design system, app shell and public site (see docs/plans/ for the plans).
- P4 (DONE): email OTP auth, sessions, profile, settings, trusted contacts, avatar signing, admin:bootstrap, auth screens.
- P5 (DONE): MapLibre light style + MapView (clusters, markers, list alternative, failed fallback), LocationPicker (region check, draggable pin, geolocation only on click), geo proxy API, geo utils, dashboard per A5.2 with six card endpoints.

- M1-M5 backends (DONE, tested): notifications, reports, flags, rides (+ride.lifecycle), journeys (+journey.scan), alerts (+alert.fanout/expire), admin API. Frontends built by agents; gates not yet run as one suite.
- P7 AutoMate frontend (S10-S13): /automate, /automate/new, /automate/[id], /automate/mine (guest-readable list and detail; proxy matcher only gates new and mine); e2e automate.spec.ts; shots in docs/qa/m2.
- M6 (DONE): idempotent demo seed (apps/api/prisma/seed.ts, refuses NODE_ENV=production), cleanup.nightly job (02:00 IST, auto-restores expired suspensions, enforces retention rules), production Dockerfile (non-root, ROLE=server|worker), regenerated tokens.generated.css.
- Core Repair & Integration (DONE):
  - Single root `.env` deduplicated (`SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM` no longer overwritten by trailing empty values).
  - SafeRoute routing verified end-to-end via OpenRouteService (`api.heigit.org/openrouteservice/v2/directions/driving-car/geojson`) returning multiple route alternatives with safety scoring and `incidentPins` (reports + active alerts) rendered on the SafeRoute map.
  - Destination geocoding fixed by removing the strict Kota `bbox` parameter and `inRegion` post-filter while keeping `proximity` bias.
  - `createCaptureMailer` implemented in `apps/api/src/modules/mail/mailer.ts` matching `CapturedEmail` Prisma fields (`toEmail`, `subject`, `htmlBody`, `textBody`) and returning `providerId`.
  - JourneyGuard UI subtitle updated in `JourneyHome.tsx` to reflect full live GPS monitoring, deviation/stop/ETA alerts, and trusted-contact notifications.

**Next**

- Run `pnpm test:e2e` with dev server stopped, configure production env/secrets (MapTiler, Resend, Turnstile, Cloudinary, Sentry) and legal/grievance copy before launch.

**Known issues**

- No MapTiler key here: the map shows the cream background (pins, clusters and picker work); tiles and place search need `MAPTILER_KEY`.
- Cloudinary not configured here: avatar upload is covered by fake-client API tests only.
- Docker engine did not start on this machine: local runs use Postgres 18 via the root .env.
- Speed strip numbers (60 sec, 5 taps, 30 sec, 45 sec) are targets, to be proven in P13.
- Legal pages are drafts; grievance officer details are placeholders in src/config/site.ts.
- Prompt 1 live check (server + worker + Next rewrite, ready 200 then 503 when the worker stops) not run by hand.

## Decisions

- Earlier phases: see docs/plans/ and git-less history in this file's previous version (P0-P4 decisions: error codes OTP_*, sealed email.send payloads, capture mailer + dev endpoints, e2e on TEST DB ports 4100/3101, DELETE /me soft delete, no git commits).
- P5: default service region is lat 24.9-25.4, lng 75.6-76.1 (Kota area) in system_settings; GET /public/region exposes it; pins outside are refused in the UI (server-side check arrives with each create endpoint).
- P5: map style is a TS module built from tokens (new token map-water for "muted water"); without a key it is background only. MapLibre workers are served from /maplibre/ (copied at next.config load, git-ignored).
- P5: geocoding goes through GET /geo/search and /geo/reverse (login required, 30/min each, 24 h LRU, results filtered to the region); 503 with a calm message when there is no key.
- P5: dashboard "Set your alert area" step and the alert-area coverage text appear only once SafeAlert exists (flag ALERT_AREA_AVAILABLE in DashboardView); "Community snapshot" has an endpoint but no card (DECISIONS #22).
- P5: the ride card caption shows time only for today ("8:15 pm"), "Tomorrow, ..." or a date otherwise.

- M2: ride search orders newest-posted first (cursor on createdAt). M3: track token is HMAC(session secret, journey id), only its SHA-256 is stored; contact email is queued after commit. M4: no alert photos; guests get coords rounded to 0.005 deg. M5: user suspensions store prefs.suspendedUntil (auto-restore in M6 cleanup); admin tables show masked emails.
- Audit enum gained STATUS_CHANGE; report photos via photoUploadIds; rejected reports hidden except to author/staff; /saferoute, /automate, /safealert lists are public routes.

## Design deviations

- text-muted (2.7-2.9:1) only for placeholders and decorative chevrons; captions and inactive tabs use text-secondary.
- White on periwinkle/coral only in icon bubbles; mint verified icon (2.25:1) is decorative beside text.
- No `sm` breakpoint (A2 has 360/768/1024/1280); small buttons keep a 44 px hit area.
- Landing subcopy wraps with a short last line at 1440 (A5.1 caps width at 480).
- Visual baselines are per platform (win32 committed); CI records its own first.
