# Milestone 9 — Security Hardening — Completion Notes

## What was built

- **`apps/api`**: `AuditModule` — `AuditLog` (recipientless-by-design, `actorId` nullable,
  survives actor deletion via `onDelete: SetNull` unlike every other actor-owned table in this
  schema). `AuditLogListener` subscribes to a new `AUDIT_EVENT` bus (sibling to M6's
  `ACTIVITY_EVENT`) and writes rows for `LOGIN`/`LOGOUT`/`SESSION_REVOKED` (from new Clerk
  `session.*` webhook handling), `AUTH_TOKEN_REJECTED` (from the shared
  `AuthenticateWithClerkTokenUseCase`), and `PERMISSION_GRANTED`/`PERMISSION_ESCALATION_ATTEMPT`/
  `PERMISSION_REVOKED` (from `GrantPermissionUseCase`/`RevokePermissionUseCase`). `GET /audit-log`
  (cursor-paginated, own-account-scoped, `eventType` filter).
- **`apps/api`**: virus-scanning pipeline — `VirusScanAdapter` port, `ClamAvScanAdapter`
  implementation talking to a new `clamav` docker-compose sidecar over clamd's TCP protocol via
  the `clamscan` npm package. Wired into `VerifyChecksumUseCase` (the same BullMQ job that already
  verifies upload checksums) between checksum verification and `File` creation. New `QUARANTINED`
  `UploadStatus` — object kept in S3, no `File` row ever created, so it's structurally unreachable
  via any download path. New ephemeral `upload:quarantined` realtime event (M8's cross-tab-sync
  pattern) plus a matching toast/status on the frontend.
- **`apps/api`**: global `ThrottlerGuard` (120 req/min default), tightened per-route on
  `GET /shared-links/:token`, `POST /shared-links/:token/download`, and
  `POST /invitations/:token/accept`; `@SkipThrottle()` on the Clerk webhook; disabled entirely
  under `NODE_ENV=test`.
- **`apps/api`**: `UploadRepository.markQuarantined`, the only new repository method this
  milestone needed.
- **`apps/web`**: `/drive/security` page — a "Manage account security" button
  (`useClerk().openUserProfile()`, opening Clerk's own `<UserProfile/>` modal for 2FA/passkeys/
  session management) plus a NovaDrive `AuditLogList` view of the caller's own security trail.
  New "Security" sidebar link.
- **`docs/security.md`** — Clerk-covered identity security, `AuditLog` design + emission-site
  table, virus-scan architecture, rate-limiting design, a verified (not assumed) CSRF/CSP
  analysis, a raw-Prisma-query injection audit, and an OWASP Top 10 checklist.

## Bugs found and fixed during this milestone

1. **`test/users.e2e-spec.ts` was silently broken by an M8 refactor**, not by anything in this
   milestone — `ClerkAuthGuard`'s constructor changed from 5 args to `(reflector,
   AuthenticateWithClerkTokenUseCase)` when auth-verification logic was extracted for reuse by
   M8's `RealtimeGateway`, but this e2e spec builds its own minimal `TestingModule` by hand
   (rather than importing the real `AuthModule`) and was never updated. Every test in the file
   failed with a DI resolution error. Invisible to unit tests (which mock `ClerkAuthGuard`'s
   dependencies directly) and to `tsc` (the spec still compiled — it just failed at runtime when
   Nest tried to resolve the guard's dependency graph). Only surfaced by actually running the full
   e2e suite, which hadn't happened since the M8 refactor landed. Fixed by adding
   `AuthenticateWithClerkTokenUseCase` and `EventEmitterModule.forRoot()` to the spec's manual
   module — the same class of gap as M8's own two DI-boot bugs (see docs/MILESTONE_8.md), and the
   same lesson: `tsc`/unit tests don't exercise Nest's runtime DI graph, only booting the real app
   (or running e2e specs against it) does.
2. **The `ThrottlerModule` design initially throttled the entire API down to 10 req/min**, not
   just the intended public/token-guessable routes. First draft registered two always-on named
   profiles (`default` at 120/min, `strict` at 10/min) and used `@Throttle({ strict: {} })` on the
   sensitive routes, on the mistaken assumption that a route only gets checked against a named
   profile it explicitly opts into. In `@nestjs/throttler`, every named profile registered via
   `forRoot()` applies to *every* guarded route by default unless skipped — so `strict` was
   silently capping the whole API, not just the three routes it was meant for. Caught before it
   shipped by re-reading the library's own multiple-throttler documentation, not by a failing
   test. Fixed by using a single `default` profile and `@Throttle({ default: { limit: 10, ttl:
   60_000 } })` per-route overrides instead of a second module-level profile.
3. **The first ClamAV integration attempt tried to run `init()` with connectivity checking
   enabled**, which would have made API boot fail whenever clamd wasn't yet accepting connections
   (e.g. still downloading virus definitions on first container start, ~minutes). Fixed by setting
   `clamdscan.bypassTest: true` — a scan failure now surfaces per-upload instead of as a boot-time
   crash, verified by booting the API before ClamAV's healthcheck had even passed.
4. **The recurring Prisma-drift artifact** (spurious `DROP INDEX`/`ALTER COLUMN DROP DEFAULT` on
   the search-vector columns) appeared on both of this milestone's migrations, same as every prior
   milestone since M5. Same fix as always: hand-strip the spurious lines, verify via `\di` that
   both GIN indexes survived.

## Architecture notes

- **`AuditLog` and `Activity` are siblings with different jobs, not one system doing double
  duty.** `Activity` (M6) is a user-facing "what happened" feed of things that actually succeeded.
  `AuditLog` (this milestone) is security-facing and also records *failures* — a rejected token, a
  blocked escalation attempt — that never produce an `Activity` row because nothing actually
  happened from the user-facing perspective. Both are populated the same way (a dedicated listener
  subscribed to a dedicated event bus, the only code that knows its own table exists), but they're
  deliberately not merged into one table with a "was this a failure" column, since their retention
  needs, audiences, and query patterns differ.
- **Quarantine's safety property comes from structural unreachability, not an access-control
  check.** A quarantined upload is never denied a download URL by a permission check — it simply
  never gets a `File` row, and every download path in the app requires one. This is the same
  design instinct as M7's anti-enumeration work: prefer "the thing an attacker wants doesn't
  exist" over "the thing exists but is denied," since the latter can leak information through
  timing or error-shape differences and the former can't.
- **`bypassTest: true` on the ClamAV client is a deliberate availability trade-off.** A stricter
  config would fail closed at connection time (API won't boot if ClamAV isn't reachable) rather
  than fail per-request; this milestone chose to keep the API available and let individual scan
  calls fail/log instead, matching the fire-and-forget philosophy already used for
  `ActivityListener`/`NotificationEventListener`/`AuditLogListener` — a monitoring/security
  subsystem being briefly unavailable shouldn't be allowed to take down the primary application.
- **CSRF was investigated and found genuinely inapplicable, not skipped.** The roadmap asked for
  "CSRF protection for any cookie-authenticated surface" — this milestone grepped the entire API
  for cookie usage, found none, and confirmed the entire auth model is Bearer-JWT-over-header
  (which CSRF, an automatic-cookie-attachment exploit, cannot target). Documented as a verified
  non-issue in docs/security.md rather than either silently skipping it or installing an unused
  CSRF library for zero endpoints that need it.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Visit `/drive/security` — click "Manage account security" to confirm Clerk's `<UserProfile/>`
  modal opens with 2FA/passkey/device-management tabs; the "Security activity" list below shows
  your own `AuditLog` entries (empty until you trigger a permission change or the Clerk `session.*`
  webhooks are configured — see docs/security.md).
- Grant then revoke a permission on a shared file — confirm both actions show up in the audit log
  as `PERMISSION_GRANTED`/`PERMISSION_REVOKED`.
- Upload a file containing the standard EICAR antivirus test string
  (`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`) — confirm the upload
  panel shows "Blocked" and the file never appears in the folder listing.
- Hammer `GET /shared-links/:token` more than 10 times in a minute — confirm a `429 Too Many
  Requests` response.

## Verified in this session

- Backend: `pnpm --filter api test` — 271 unit tests passing (30 new this milestone across the
  `AuditLog` listener/use-case/repository, the audit-emission retrofits on
  `AuthenticateWithClerkTokenUseCase`/`ClerkWebhookController`/`GrantPermissionUseCase`/
  `RevokePermissionUseCase`, and the virus-scan quarantine branches of `VerifyChecksumUseCase`).
  `pnpm --filter api test:e2e` — 77 e2e tests passing (15 new: a real EICAR upload through the
  live HTTP → BullMQ → ClamAV pipeline confirming `QUARANTINED` + no `File` created, plus a
  14-case SQLi/XSS payload sweep across folder-name and search-query inputs, confirming payloads
  round-trip as inert data and the database survives). Found and fixed a real pre-existing e2e
  regression from an M8 refactor in the process (see Bugs above) — the full suite is green again,
  not just the milestone's own new specs.
- Frontend: `pnpm --filter web typecheck` and `lint` both clean; new `/drive/security` page and
  `AuditLogList` component compile without errors.
- Live-verified ClamAV integration twice: once with a standalone script against the real clamd
  container confirming EICAR detection (`Eicar-Test-Signature`) and clean-content pass-through,
  and again through the full e2e upload pipeline.
- Live-verified Helmet's default CSP against the real Swagger docs page in a real browser — zero
  violations, zero console errors, confirming no custom CSP directives were needed.
- App-boot smoke tests after every module-wiring change (not just `tsc`) — this is what caught the
  ClamAV `bypassTest` issue before it could block a fresh environment's first boot.
- `/drive/security` was confirmed to correctly redirect an unauthenticated visitor to sign-in
  (proving Clerk's middleware guards the new route identically to every other `/drive/*` page),
  but the fully-authenticated walkthrough (opening the real `<UserProfile/>` modal, seeing
  populated audit-log rows) wasn't re-verified live in this session — the browser's dev Clerk
  session had expired and creating a new one isn't something to do without the user's own
  involvement. Same category of gap as M7's "brand-new user" and M8's "second real user session"
  cases.

## Acceptance criteria status

- [~] 2FA/passkey enrollment and login both work via Clerk's `<UserProfile/>` and sign-in flow —
      this is Clerk's own tested surface (explicitly not ours to re-test per the roadmap's own
      note), and the integration point (`openUserProfile()` opening the real modal) is
      code-reviewed and typechecked but wasn't re-verified with a live authenticated session this
      session (see above).
- [x] An EICAR test file upload is caught, quarantined, and never becomes downloadable — verified
      live twice: a standalone adapter check against real ClamAV, and a full e2e test driving the
      real upload pipeline end-to-end and asserting no `File` row is ever created.
- [x] A Clerk sign-in webhook event and a sensitive in-app action both produce an `AuditLog` entry
      — verified by unit tests for both the `session.created` webhook handler and the permission
      grant/revoke/escalation-attempt paths; the full webhook → local-user-resolution → audit-row
      pipeline is unit-tested end-to-end within `ClerkWebhookController`'s own test suite.
- [x] Automated SQLi/XSS payload sweep across all input fields shows no vulnerabilities — a
      14-case e2e sweep against folder names and search queries (representative inputs, not
      literally every field in the app) confirms every payload round-trips as inert data via
      Prisma's parameterized queries, and a full-codebase audit confirmed zero uses of
      `$queryRawUnsafe`/`$executeRawUnsafe`/`Prisma.raw()` anywhere.

Milestone 9 is production-ready for the security surface actually built, with gaps explicitly
documented rather than silently assumed away: no automated dependency-vulnerability scanning, no
`AuditLog` retention/purge job yet, and the live 2FA/UserProfile walkthrough pending a session with
real Clerk credentials. Awaiting your confirmation before starting Milestone 10 (Organizations &
Multi-tenancy).
