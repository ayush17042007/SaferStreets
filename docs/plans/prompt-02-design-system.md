# Prompt 2 plan: Lamplight design system

## Token architecture

- `apps/web/src/design/tokens.ts` is the only file with hex values (A2 verbatim): `colors`, `radii`, `sizes`, `shadows`, `focusRing`, `motion`, `breakpoints`, `typeScale` (desktop/mobile), `spacing` (4 px grid).
- Tokens are structured as `themes.light`, so a `themes.dark` can be added later; only light ships.
- `globals.css` declares CSS variables for the light theme under `:root` (the only CSS file allowed hex, as it is generated from tokens by `pnpm tokens:css`, checked for drift in a test) and a Tailwind 4 `@theme` block that REPLACES the default palette (`--color-*: initial`) with token colours.
- Fonts: `next/font` Plus Jakarta Sans (`--font-display`) and Inter (`--font-body`).
- Icons: `@tabler/icons-react` outline only, with the A3 mapping as a typed `icons` map (stroke 1.75).

## Components (all presentational, props only, `src/components/ui/*`)

Primitives: Button (+IconButton), TextField, TextArea, Select (Radix), DateTimePicker (native datetime-local styled), OTPInput, ImageUploader, Card, IconBubble, StatusChip, Avatar, Badge, Skeleton, ProgressBar, Stepper, CountdownRing, Banner, Toast.
Overlays: Modal, ConfirmDialog, BottomSheet, EmergencySheet (Radix Dialog), Tabs, Accordion (Radix).
Composites: CategoryTile, RideCard, AlertCard, ReportCard, JourneyCard, FilterBar, Timeline, EmptyState, ErrorState, DataTable, Pagination/InfiniteList, NotificationItem.
Assets: LogoMark, Wordmark, NightMap, three empty-state illustrations.

## Gallery

`/dev/components` (404 in production) renders every component in default, hover (forced class), focus (forced class), disabled, loading, error, empty and selected states, inside a desktop frame and a 390 px mobile frame.

## Checks and tests

- `pnpm check:tokens`: fails on any hex colour or default-palette Tailwind class (`bg-red-500`, ...) outside `tokens.ts` / generated CSS; wired into CI.
- Vitest + Testing Library: OTPInput, Button, StatusChip, focus ring; contrast test over every chip and button pair (WCAG AA 4.5:1 text, 3:1 large/icons); `vitest-axe` on the gallery.
- Playwright: screenshots at 1440x900, 768x1024, 390x844, baselines in `apps/web/e2e/__screenshots__`.

## Sanity check vs spec

A2 values copied exactly; coral never used for small text; amber and coral carry `ink` text; white text only on ink, periwinkle, emergency-solid; 44 px targets; reduced motion honoured via a global media query.
