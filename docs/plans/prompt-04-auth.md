# Prompt 4 plan: authentication, profile, contacts, uploads

## OTP state machine (per email, newest code only)

`request`: Turnstile ok -> rate limits (5/h per email, 20/h per IP, 429 + Retry-After) -> if newest code is < 60 s old, send nothing -> else create `otp_codes` row (HMAC-SHA256 of `email:code`, 10 min, attempts 0) for ANY valid email, mark older unconsumed codes consumed, enqueue `email.send`. Always `200 { message, resendAfterSeconds }`, identical for known and unknown addresses.

`verify`: load newest code for the email. Missing or consumed -> `OTP_INVALID` (same as wrong). Expired -> `OTP_EXPIRED`. attempts >= 5 -> `OTP_LOCKED` (429). Wrong -> attempts+1 atomically, `OTP_INVALID` with `meta.attemptsLeft`. Match (timingSafeEqual) -> consume in a transaction (guarded `consumed_at IS NULL`), find or create user, set `email_verified_at`, create session, set cookie. DELETED/BANNED/SUSPENDED users get the generic invalid answer after consuming (no enumeration).

## Sessions

256-bit random token, only `HMAC(SESSION_SECRET, token)` stored. Cookie `ss_session`: httpOnly, SameSite=Lax, Path=/, Secure whenever APP_ORIGIN is https. 30-day sliding expiry (re-extended at most once a day). Login always issues a fresh token (rotation). `requireAuth` already rejects revoked/expired/suspended/banned on every request.

## Mailer adapter

`Mailer.send({to, subject, html, text})` with `resend` (HTTPS API), `smtp` (nodemailer, Mailpit) and `capture` (writes `captured_emails`, test/dev only, refused in production). Request paths only enqueue: the `email.send` pg-boss job (5 retries, exponential backoff) writes `email_events`. The job payload is AES-256-GCM sealed (recipient and OTP never sit in pg-boss tables in clear), the email queue deletes finished jobs after 1 hour.

## Upload signing

`POST /uploads/sign` (avatar only now): per-user quota, `uploads` row PENDING with a random key, Cloudinary signed params (folder, public_id, timestamp, allowed formats, incoming transformation that strips metadata and re-encodes to WebP, SHA-1 signature). `PATCH /me {avatarUploadId}` re-checks the asset with Cloudinary (format, <= 5 MB), sets `avatar_url`, marks ATTACHED. Without Cloudinary credentials the endpoint answers 503 and the UI says so.

## Frontend

`proxy.ts` redirects cookie-less visits to `/login?next=`; the `(app)` layout validates the session through `GET /me` (forwarding cookies) and sends users who haven't finished onboarding to `/welcome`. Route groups: `(auth)` login/verify, `(onboarding)` welcome, `(app)` the rest (profile, settings, journeyguard/contacts, dashboard stub). Alert-area tab stays hidden until Prompt 9.

## Sanity check

Spec: neutral responses, 60 s cooldown, 5 attempts, newest code only, hashed storage, rotation, CSRF, never logging OTP/tokens (logger redacts `code`, `token`, `email`). Added error codes OTP_INVALID/OTP_EXPIRED/OTP_LOCKED plus `meta` in the error shape (logged in PROGRESS).
