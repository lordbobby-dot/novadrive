# Security

## Identity & account security (Clerk)

Since Milestone 1, identity is entirely delegated to Clerk — NovaDrive's own database has no
password, TOTP secret, or WebAuthn credential table, and never will. Everything a user needs to
manage their own account security lives in Clerk's own `<UserProfile/>` component, surfaced via
the "Manage account security" button on `/drive/security` (`useClerk().openUserProfile()`):

- **2FA** (TOTP + backup codes) — enrolled and managed entirely inside `<UserProfile/>`. Nothing
  in this codebase enforces or checks 2FA status; that's Clerk's own sign-in flow's job.
- **Passkeys / WebAuthn** — same: enrollment and authentication happen inside Clerk's UI and
  sign-in flow, not NovaDrive code.
- **Active sessions / devices** — `<UserProfile/>`'s "Devices" tab lists and can revoke individual
  sessions. A revoked session produces a `session.revoked` Clerk webhook, which NovaDrive turns
  into a `SESSION_REVOKED` `AuditLog` entry (see below) — the only place this app's own code
  touches session state at all.

To require 2FA, enable passkeys, or configure session lifetime, use the Clerk Dashboard — none of
that is application code. See [docs/clerk-setup.md](clerk-setup.md) for the initial setup, and
enable `session.created`/`session.ended`/`session.revoked` webhook events there (alongside the
existing `user.*` events) for the login/logout/session-revoked audit trail to work.

## AuditLog

`AuditLog` (recipientless-by-design — actorId is nullable) is distinct from `Activity` (M6):
`Activity` is a user-facing "what happened" feed of successful actions; `AuditLog` is a
security-facing record that also captures *failures* — a rejected auth token, a blocked
permission-escalation attempt — that `Activity` never sees, because `Activity` only records
things that actually happened.

Written exclusively by `AuditLogListener` (`AuditModule`), which subscribes to the same
`AUDIT_EVENT` bus every emission site uses — mirroring `ActivityListener`'s role for `Activity`.
Current emission sites:

| Event | Outcome | Emitted from |
|---|---|---|
| `LOGIN` | `SUCCESS` | Clerk `session.created` webhook |
| `LOGOUT` | `SUCCESS` | Clerk `session.ended` webhook |
| `SESSION_REVOKED` | `SUCCESS` | Clerk `session.revoked` webhook |
| `AUTH_TOKEN_REJECTED` | `FAILURE` | `AuthenticateWithClerkTokenUseCase` (shared by HTTP and Socket.io handshake auth) when a supplied bearer token fails verification |
| `PERMISSION_GRANTED` | `SUCCESS` | `GrantPermissionUseCase`, on success |
| `PERMISSION_ESCALATION_ATTEMPT` | `FAILURE` | `GrantPermissionUseCase`, when the granter's own role doesn't outrank the role they tried to hand out |
| `PERMISSION_REVOKED` | `SUCCESS` | `RevokePermissionUseCase` |
| `VIRUS_DETECTED` | `FAILURE` | `VerifyChecksumUseCase`, when the virus scan flags an upload |

`GET /audit-log` (cursor-paginated, `eventType` filter) returns the *caller's own* entries only —
same account-scoped-feed pattern as `GET /activity` with no `targetId`, since a security trail is
inherently personal, not something to show about other users.

**Retention**: `AuditLogPurgeScheduler` (`AuditModule/infrastructure/`) registers a daily
repeatable BullMQ job — same `upsertJobScheduler` pattern Trash's `TrashCleanupScheduler` uses —
that runs `PurgeAuditLogsUseCase`: one batched `deleteMany` for every row older than
`AUDIT_LOG_RETENTION_DAYS` (default 90, the same window this section recommended before the job
existed). Unlike Trash's per-item purge there's no S3/permission work that can fail partway
through a single row, so the whole sweep is one delete rather than a per-row loop. A dedicated
`AuditLog(createdAt)` index backs the scan — neither of the table's other two indexes
(`[actorId, createdAt]`, `[eventType, createdAt]`) helps a pure age-based query, since `actorId`
is nullable and `eventType` is an unrelated filter.

## Virus scanning

Every upload passes through ClamAV before it's ever eligible to become a `File`. Architecture
(picked and documented per the roadmap's "pick one and document" instruction):

- **ClamAV via a docker-compose sidecar** (`clamav/clamav:stable`, service name `clamav`,
  port 3310), not a cloud AV API — no external API key/vendor dependency, consistent with running
  Postgres/Redis as local containers already. `platform: linux/amd64` is pinned in
  `docker-compose.yml` since no arm64 manifest is published for this image; Docker Desktop's
  emulation handles it transparently on Apple Silicon.
- **`clamscan` npm package**, configured for `clamdscan` mode only (`clamscan.active: false`) —
  talks to clamd's TCP INSTREAM protocol directly, so the API container needs no ClamAV binary
  installed locally. `bypassTest: true` so a not-yet-ready clamd (still downloading virus
  definitions on first boot, or mid-restart) doesn't prevent the whole API from starting — a scan
  failure surfaces per-upload instead of as a boot-time crash.
- **Scan step lives in `VerifyChecksumUseCase`** (`apps/api/src/modules/uploads`), the same
  BullMQ-queued job that already verifies the client-declared checksum (M3) — inserted after
  checksum verification succeeds, before the `File`/`FileVersion` row is created. Runs for every
  upload unconditionally (new files and new versions alike), regardless of whether a client
  checksum was even declared.
- **Quarantine, not deletion.** An infected upload is marked `QUARANTINED` (a new `UploadStatus`
  enum value) and its S3 object is *kept*, not deleted — the roadmap's explicit instruction, so a
  quarantined object remains available for later forensics/audit rather than disappearing. No
  `File` row is ever created for it, which is what actually makes it unreachable: every download
  path in this app goes through a `File` id, and a quarantined `StorageObject` never gets one —
  structurally unreachable, not merely access-denied.
- **Live-verified against the real EICAR test string** (the antivirus industry's standard,
  harmless test payload) in both a standalone adapter check and a full e2e test
  (`test/uploads.e2e-spec.ts`) that uploads it through the real HTTP → BullMQ → ClamAV pipeline
  and asserts the upload ends up `QUARANTINED` with no `File` ever created.

## Rate limiting

`@nestjs/throttler`'s `ThrottlerGuard` is bound globally (`APP_GUARD`) with a single named
`default` profile (120 requests/minute per IP). A handful of public or token-guessable endpoints
tighten this per-route via `@Throttle({ default: { limit: 10, ttl: 60_000 } })`:

- `GET /shared-links/:token` and `POST /shared-links/:token/download` — public, unauthenticated,
  password-gated; the actual target a password-brute-force attempt would go after.
- `POST /invitations/:token/accept` — requires auth, but the invitation token itself is the real
  security boundary; tightened as defense-in-depth against a signed-in attacker guessing tokens.

`POST /webhooks/clerk` is `@SkipThrottle()`'d — it's authenticated by HMAC signature, not user
identity, and a legitimate burst of Clerk events (e.g. a bulk user import) shouldn't get
IP-rate-limited the way user-facing traffic should.

Throttling is disabled under `NODE_ENV=test` (`skipIf` in `app.module.ts`) — e2e specs fire many
requests at the same throttled routes from one test-runner IP well within normal single-client
usage; that's not something tests should have to work around, and disabling it in test doesn't
weaken the real deployment's limits at all.

Adding a second always-on named profile for the tightened routes was considered and rejected:
`ThrottlerModule.forRoot([...])`'s named profiles all apply to *every* route by default unless
skipped, so a second profile would throttle the whole API down to its limit, not just the routes
meant to be stricter. Per-route `@Throttle()` overrides of the single `default` profile avoid that
trap.

## CSRF

**Not applicable, and deliberately not implemented** — verified, not assumed. CSRF specifically
exploits a browser's automatic attachment of cookies to cross-site requests; NovaDrive's API has
no cookie-authenticated endpoint to exploit. Every endpoint is either `@Public()` (shared-link
access, the Clerk webhook) or authenticated via a `Authorization: Bearer <Clerk JWT>` header sent
explicitly by the frontend's `useAuthedFetch` — a header an attacker's page cannot make the
browser attach without JS access to the token, which same-origin policy already prevents.
Confirmed by grepping the entire API for `res.cookie`/`response.cookie`: zero results. Clerk's own
session cookie authenticates the *Next.js frontend's pages* (via `clerkMiddleware`), never this
app's own backend — that cookie's CSRF handling is Clerk's responsibility, the same category as
2FA/passkeys above.

(`apiFetch` sends `credentials: "include"` and the API's CORS config sets `credentials: true` —
inert today since no cookie exists for the API's origin to attach, kept only because removing it
serves no security purpose and isn't part of this milestone's scope.)

## CSP / Helmet

`helmet()` is applied with its default configuration — verified live against the actual app
rather than assumed safe: the Swagger docs page (`/api/docs`) was loaded in a real browser and
confirmed to render with zero CSP violations and zero console errors under Helmet's default
Content-Security-Policy (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
`frame-ancestors 'self'`, plus HSTS and `X-Content-Type-Options: nosniff`). No custom CSP
directives were needed; NestJS's bundled swagger-ui-express assets are already same-origin and
CSP-default-compatible.

## SQL injection / raw queries

Every Prisma raw-query call site in the codebase was audited:

```
apps/api/src/modules/sharing/infrastructure/prisma-shared-link.repository.ts
apps/api/src/modules/trash/infrastructure/prisma-trash.repository.ts   (×2)
apps/api/src/modules/search/infrastructure/postgres-search.service.ts
apps/api/src/modules/folders/infrastructure/prisma-folder.repository.ts
```

All five use Prisma's tagged-template `$queryRaw`/`$executeRaw`/`Prisma.sql`, where every `${...}`
interpolation is a genuine parameterized value (an id, a date, a computed path prefix, the
free-text search query) sent to Postgres as a separate bind parameter — never string
concatenation. Zero uses of `$queryRawUnsafe`, `$executeRawUnsafe`, or `Prisma.raw()` exist
anywhere in the codebase (verified by grep). Confirmed live with a SQLi payload sweep
(`test/security.e2e-spec.ts`) that round-trips `'; DROP TABLE "User"; --` and similar payloads
through folder names and search queries, asserting both that the payload comes back as inert
literal data and that the `User` table (and every other request in the suite) survives.

## XSS

The frontend has zero uses of `dangerouslySetInnerHTML` or direct `.innerHTML` assignment
(verified by grep) — every piece of user-supplied text (file/folder names, comment bodies, search
results) renders through ordinary JSX, which React escapes by default. Combined with the backend
round-tripping payloads as inert data (above), an XSS payload stored via the API renders as
literal visible text in the UI, not as executed markup.

## OWASP Top 10 (2021) checklist

| # | Category | Status |
|---|---|---|
| A01 | Broken Access Control | `PermissionGuard` + `RequirePermission` on every M2–M9 endpoint (M7); ownership/role checks in every use case; anti-enumeration on shared links (M7). |
| A02 | Cryptographic Failures | No secrets stored in NovaDrive's own DB — auth is Clerk-owned; S3 objects use `AES256` server-side encryption (M3); shared-link passwords are hashed, never stored in plaintext (M7). |
| A03 | Injection | Audited above — 100% parameterized Prisma queries, zero raw string interpolation, verified live with a payload sweep. |
| A04 | Insecure Design | Guard-based authorization (not query-scoped), quarantine-not-delete for infected uploads, anti-enumeration by design (M7) — see docs/permissions.md. |
| A05 | Security Misconfiguration | Helmet defaults verified live against the real app; strict `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) rejects unexpected fields globally, verified by test. |
| A06 | Vulnerable and Outdated Components | `.github/dependabot.yml` — weekly scans across the `npm` ecosystem (pnpm workspace root, covering every `apps/*`/`packages/*`/`shared` package), `github-actions`, and `docker` (both Dockerfiles) — opens a PR per vulnerable/outdated dependency, minor/patch npm bumps grouped into one PR per run to keep volume manageable. |
| A07 | Identification and Authentication Failures | Delegated entirely to Clerk (2FA, passkeys, session management); rejected/expired tokens are audit-logged (`AUTH_TOKEN_REJECTED`). |
| A08 | Software and Data Integrity Failures | Upload checksum verification (M3) plus virus scanning (this milestone) both gate a file before it's ever downloadable. |
| A09 | Security Logging and Monitoring Failures | `AuditLog` (this milestone) + `Activity` (M6) together cover both security-relevant and user-facing event trails. |
| A10 | Server-Side Request Forgery | No user-supplied URLs are ever fetched server-side anywhere in the codebase — presigned S3 URLs are generated, not fetched; Clerk webhook payloads are signature-verified before use. |

## Known gaps

- No per-resource rate limiting beyond the global IP-based default (e.g. a single user hammering
  one specific shared link vs. spreading requests across many).
- 2FA/passkey enrollment itself wasn't re-verified live in this milestone's browser walkthrough —
  it's Clerk's own tested surface, not this app's code, consistent with the roadmap's own
  "2FA/WebAuthn themselves are Clerk's tested surface, not ours to re-test" note.
