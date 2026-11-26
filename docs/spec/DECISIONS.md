# Spec conflicts and resolutions

Hand-written (not generated). Lists every conflict found between `master_head.md` (Part 0/A/B, "MH") and `BLUEPRINT.md` (the Appendix, "BP"). Rule: **master_head wins** (Part 0.3). Section numbers refer to the source documents; see INDEX.md for the file holding each section. Rows 1 to 10 are already listed in MH 0.4; the rest were found by comparing the documents line by line.

## Conflicts

| # | Topic | BLUEPRINT says | master_head says (wins) | Use |
|---|---|---|---|---|
| 1 | Palette | BP 4.1: Deep Indigo `#2F2A6B` brand, Signal Teal `#14B8A6` accent, slate neutrals `#0F172A`…`#F8FAFC` | MH 0.4, A2: Lamplight tokens (`ink #111A3B`, `cream #FAF7F2`, `card #FFFFFF`, `line #E8E3D9`, …) | Lamplight tokens only |
| 2 | Module colours | BP 4.1: SafeRoute Amber `#F59E0B`, AutoMate Sky `#0EA5E9`, JourneyGuard Violet `#7C3AED`, SafeAlert Crimson `#DC2626` | MH A2: SafeRoute `amber #FFB020`, AutoMate `mint #19C39A`, JourneyGuard `periwinkle #6C63FF`, SafeAlert `coral #FF5A5F` | MH A2 module colours |
| 3 | Emergency colour | BP 4.1: Crimson `#DC2626` for SafeAlert accent **and** emergency actions; BP 4.2: "persistent red Emergency chip"; BP S21: "sticky red banner" | MH A2/A4: coral is icons/fills only, never small text; Emergency button = `coral-tint`/`coral-text`/`coral-border`; solid "Call 112" = `emergency-solid #D92D3A`; A5.6 banner = `coral-tint` + `coral-border` | Coral family + `emergency-solid`; no crimson |
| 4 | Status colours | BP 4.1: Success/Warning/Danger/Info `#16A34A`/`#D97706`/`#DC2626`/`#2563EB` | MH A2 "Status chip mapping" table (tints + `*-text` tokens) | MH A2 chip mapping |
| 5 | Status indicator rule | BP 4.1: status "always icon plus label" | MH A2: "always text, optionally an icon" | Text required, icon optional |
| 6 | Typography scale | BP 4.1: scale 12/14/16/18/20/24/30/36, line height 1.5 body / 1.2 headings; Plus Jakarta for headings | MH A2: Display 56/60 (40/44 mobile), H1 32/38, H2 24/30, H3 18/24, Body 16/24, Small 14/20, Caption 12/16; Plus Jakarta also for key numbers | MH A2 scale (fonts unchanged) |
| 7 | Radii, shadows | BP 4.1: cards 12–16, controls 8, "soft shadows" | MH A2: chips 999, controls 12, cards 16, hero 20–24, map cards 24; cards flat with 1 px `line` border, shadow only on hover/popovers | MH A2 |
| 8 | Dark mode | BP 4.1 "dark theme mirrors with tokens"; BP 12 checklist "dark mode tokens" | MH 0.4: light theme only for v1; tokens structured for dark later [FUTURE] | Light only |
| 9 | Map library | BP 8: Leaflet + react-leaflet (MapTiler tiles) | MH 0.4, A4, B9: MapLibre GL JS + MapTiler vector tiles, custom light style versioned in repo; geocoding proxied via API | MapLibre GL |
| 10 | Landing hero visual | BP S1: hero with "phone mockup" | MH 0.4, A5.1: static night-map SVG card (A3), not a live map, no phone mockup | Night-map SVG |
| 11 | Icons | BP 4.3: generic `CategoryIcon`, no set named | MH 0.4, A3: Tabler outline via `@tabler/icons-react`, fixed icon mapping | Tabler outline |
| 12 | Background jobs | BP 7.1 `jobs/{journeyScheduler,…}` in API; BP 7.6 + 8: node-cron inside the API process, optional `/internal/cron/*` endpoints | MH 0.4, B1, B3: pg-boss in a separate `worker.ts` entrypoint (`ROLE=worker`), named jobs `journey.scan`, `ride.lifecycle`, … | pg-boss worker |
| 13 | Email queue and retries | BP 7.6: in-process async queue, 3 attempts, records `email_sent_at` | MH B3: `email.send` pg-boss job, 5 attempts, writes `email_events`, dead-letter handling | pg-boss `email.send` |
| 14 | Rate-limit store | BP 8: `express-rate-limit` (+ Redis store later) | MH 0.4, B5: `rate-limiter-flexible` with Postgres store, keyed by user ID else IP, `Retry-After` | rate-limiter-flexible (Postgres) |
| 15 | API origin / CORS | BP 7.3: "strict CORS allow-list"; BP 8: `cors` lib | MH 0.4, B2: same origin, Next.js rewrites `/api/*` to Express; keep `X-Requested-With` + `Origin` checks | Same origin, no CORS |
| 16 | OTP abuse | BP 9: rate limits only | MH 0.4, B7: add Cloudflare Turnstile on OTP request, keep per-email/IP limits | Turnstile + limits |
| 17 | Pagination | BP 7.2: `?page=&limit=` → `{data, meta:{page,limit,total}}` | MH 0.4, B5: cursor `?cursor=&limit=20` → `{data, meta:{nextCursor}}` for reports, rides, alerts, notifications; admin tables may use offset | Cursor (offset only for admin tables) |
| 18 | Error model | BP 7.2: `{error:{code,message,details}}` | MH B5: same shape plus `requestId`; validation errors list field paths | Add `requestId` |
| 19 | Extra tables/columns | BP 6.2: no idempotency, blocks, uploads, email events, heartbeats, consents, version columns | MH B4: adds `idempotency_keys`, `user_blocks`, `uploads`, `email_events`, `email_suppressions`, `heartbeats`, `consents`, `ride_waitlist` [OPT], `version` on `rides`/`reports` | BP 6 + MH B4 |
| 20 | Ride waitlist | BP: not mentioned (not in v1) | MH 0.4, A5.4, B4: "Join waitlist" is [OPT]; MVP shows a disabled "Full" state | Disabled "Full" in MVP |
| 21 | Report categories in UI | BP 2A, 6.1: 7 categories incl. "Damaged footpath", "Isolated/unsafe area", `OTHER` | MH A5.3: six tiles labelled "Footpath", "Isolated area"; no "Other" tile | Enum keeps all 7 (data rule, Appendix wins); tile labels per A5.3; how `OTHER` is shown is decided in Prompt 6 and logged |
| 22 | Dashboard layout | BP S5: Active journey "banner" with countdown; "Community snapshot" card | MH A5.2: Active journey card with progress bar; no Community snapshot in the layout | A5.2 layout; Community snapshot not shown in v1 |
| 23 | Overdue journey visual | BP S17: header turns amber with "Are you safe?" | MH A5.5: chip becomes "Are you safe?" in `coral-tint`, ring turns amber, primary button "I'm safe" | A5.5 |
| 24 | Alerts feed controls | BP S21: Nearby / All **tabs** | MH A5.6: chips row Nearby (selected), All, Accident, Medical, Fire | A5.6 chips |
| 25 | Copy strings | BP S5 "Report issue"; BP 2D/S21 "Report emergency"; BP S21 empty "All quiet nearby"; BP S11 "≈ ₹X each" | MH A5.2 "Report an issue"; A5.6 "Report an emergency"; A5.2/A6 "All quiet around you."; A5.4 "about ₹X each" | MH copy |
| 26 | Ride host name | BP S10: "creator avatar and first name"; BP 7.5 `"name":"Riya"` | MH A4/A5.4: "Riya S." (first name + last initial) | "First L." for signed-in viewers; guests still get no names (BP 2B) |
| 27 | Button variants | BP 4.3: primary / secondary / ghost / danger / emergency | MH A4: Ink, Amber, Secondary, Ghost-on-dark, Emergency, Emergency-solid; no separate "danger" | A4 variants; destructive actions use the Emergency (coral-tint) treatment without the phone icon (A1: red only for emergencies and destructive actions) |
| 28 | Field error colour | BP 4.4: "inline red text" | MH A4: `coral-text` message with icon, linked by `aria-describedby` | `coral-text` token |
| 29 | Screenshot / responsive viewports | BP 11, 12: Playwright at 360, 768, 1280 px | MH 0.5, A8: screenshots at 1440x900, 768x1024, 390x844; A2 breakpoints 360/768/1024/1280 | Visual QA at MH viewports; responsive checks may add 360 and 1280 |
| 30 | Testing framework | BP 8, 11: "Vitest/Jest" | MH 0.6 (Prompt 1): Vitest + Supertest on a test DB | Vitest only |

## Not conflicts (checked, consistent)

Fonts (Plus Jakarta Sans + Inter), OTP rules and 60 s resend, session cookie flags (MH B2 adds `Path=/`), rate-limit numbers (BP 9 table unchanged), journey timing (+10 min overdue, +30 min contact), 100 m duplicate radius, Cloudinary uploads (MH B9 also allows S3-compatible), geo search (bbox + Haversine, PostGIS [FUTURE]), hosting (MH B10 adds Fly.io and "must not sleep"), `/api/v1` base path (sits under the `/api/*` rewrite).
