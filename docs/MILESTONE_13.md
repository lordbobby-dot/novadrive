# Milestone 13 — Admin Panel — Completion Notes

## What was built

- **`apps/api`**: `User.isSystemAdmin` (a flat platform-wide boolean, distinct from every
  per-resource/organization role already in the schema) plus `isSuspended`/`suspendedAt`, bootstrapped
  via a new `ADMIN_BOOTSTRAP_EMAILS` env var checked on every Clerk sync (grant-only, never
  revokes). A new `AdminGuard` (modeled on `PermissionGuard`'s metadata-driven, globally-registered,
  opt-in-via-decorator shape) gates every `/admin/*` route via `@RequireAdmin()`.
- **`apps/api`**: a from-scratch `AdminModule` — `GET /admin/users` (search/paginate),
  `PATCH /admin/users/:id/suspend` / `/unsuspend` (bans/unbans via Clerk's real `banUser`/
  `unbanUser` API, which immediately revokes live sessions, plus a local `isSuspended` flag
  checked by `ClerkAuthGuard` as defense in depth), `PATCH /admin/users/:id/system-role`
  (grant/revoke admin, with self-lockout protection mirroring M10's org-owner guard),
  `GET /admin/organizations` (platform-wide listing with member/workspace counts and storage
  usage, not membership-scoped like the existing org switcher), `GET /admin/audit-logs` (the
  existing `AuditLogRepository` widened from actor-required to actor-optional, plus a new
  `targetType` filter), `GET /admin/system-health` (real, live Postgres/Redis/S3 connectivity
  checks plus BullMQ queue depth — the first real dependency-connectivity code in the repo;
  M0's `/health` stays a pure liveness stub, M14 owns the eventual real `/health/ready`), and
  `GET /admin/analytics` (signups/day, cumulative storage uploaded/day, active/total user and org
  counts, via raw SQL date-bucketed queries).
- **`apps/api`**: four new `AuditEventType` values (`USER_SUSPENDED`, `USER_UNSUSPENDED`,
  `ADMIN_ROLE_GRANTED`, `ADMIN_ROLE_REVOKED`) — every admin action against a user is itself
  audited, actor = the admin, target = the affected user.
- **`apps/web`**: a full `/admin/*` section with its own layout (not nested under `/drive`), a
  client-side `AdminRouteGuard` (UX-only redirect for non-admins; the real boundary is the API's
  `AdminGuard`), a sidebar "Admin" link shown only to `isSystemAdmin` users, and five pages: Users
  (search, suspend with a confirm dialog, unsuspend, promote/demote), Organizations (usage
  summaries), Audit Logs (actor/event/target filters), System Health (live status + queue depth,
  auto-refreshing every 30s), and Analytics (stat cards + two hand-rolled SVG line charts, no new
  charting dependency — same call M11 made for the storage donut).
- **`docs/admin.md`** (new) — the bootstrap mechanism, the `AdminGuard` pattern, the suspend
  flow's two-layer defense, the admin-wide-vs-personal-query pattern applied to three existing
  repositories, the system-health check design, and what's exact vs. approximate in analytics.

## Scope decisions and judgment calls

1. **`isSystemAdmin` as a boolean, not a `SystemRole` enum.** The roadmap offered either. A flat
   boolean is sufficient for "is this person an admin" with no intermediate platform-level roles
   named anywhere in the roadmap's acceptance criteria — introducing an enum with only one
   non-default value would be complexity with no present use.
2. **Suspension needed a real mechanism, not just a database flag.** The roadmap's acceptance
   criterion ("suspending a user immediately invalidates their active sessions") ties directly
   into M1's decision to delegate all identity/session state to Clerk. Clerk's `banUser` API does
   exactly this natively (revokes every live session), so suspension calls it directly rather than
   reinventing session invalidation — but a local `isSuspended` flag was added anyway as defense
   in depth, checked in `ClerkAuthGuard`, since relying on a single external system's revocation
   timing for a security boundary is worth the one extra column.
3. **Three existing repositories needed a genuinely new query shape, not a parameter tweak.**
   `AuditLogRepository`, `OrganizationRepository`, and `StorageQuotaRepository` were all built
   around "the current actor's own view" in earlier milestones. Rather than bending those into
   dual-purpose methods with unclear semantics, each gained one clearly-named admin-wide sibling
   (`listAll`/`findManyBySubjects`) or a widened-to-optional field, documented in each repository
   interface as to which caller uses which.
4. **No admin backdoor into Drive content.** `AdminModule` never imports `FoldersModule`/
   `FilesModule` and exposes no endpoint that reads file/folder contents or bypasses
   `PermissionResolver`. Admin authority is scoped to platform management (users, orgs-as-records,
   audit trail, health, aggregate analytics) — an admin who isn't a member of an organization still
   can't browse into its Drive. This wasn't explicitly required by the roadmap but follows
   directly from "Admin gated by a platform-level role, distinct from per-resource RBAC" — the
   roadmap's own framing implies admin authority doesn't fold into resource RBAC, only sits beside
   it.
5. **System health lives in `AdminModule`, not `HealthModule`.** M0's `/health` and M14's planned
   `/health/ready` are both meant to be lightweight, possibly-unauthenticated liveness/readiness
   probes for infrastructure (load balancers, orchestrators). `GET /admin/system-health` is a
   richer, admin-only diagnostic view (queue depth, not just up/down) meant for a human looking at
   a dashboard — different audience, different endpoint, deliberately not consolidated.
6. **Analytics' "storage growth" is a cumulative-uploads counter, not live usage.** No historical
   snapshot table exists to answer "how much was actually stored on day X" after accounting for
   deletions. Building one was out of scope for this milestone; the chosen approximation
   (monotonically increasing, documented as such in both the API response type and the UI copy)
   was judged more honest than either silently mislabeling it as current usage or not shipping the
   chart at all.

## Architecture notes

- **`AdminGuard` mirrors `PermissionGuard`'s shape, not `ClerkAuthGuard`'s.** Both are global
  guards registered via `APP_GUARD`, no-ops unless a route opts in via decorator metadata
  (`@RequirePermission`/`@RequireAdmin`), and both run after `ClerkAuthGuard` in the guard chain so
  `request.user` is already resolved. `AdminGuard` is simpler than `PermissionGuard` precisely
  because `isSystemAdmin` needs no per-resource resolution — it's a flat check against the
  already-authenticated user, closer in complexity to `ClerkAuthGuard` itself than to
  `PermissionResolver`'s inheritance-aware role resolution.
- **`AdminModule` registers the checksum-verification and trash-cleanup queues a second time**
  (same queue names, same shared Redis connection from `QueueModule`) purely to read connectivity
  and job counts, rather than importing `UploadsModule`/`TrashModule` and pulling in their much
  larger dependency graphs (S3 adapter, ClamAV client, permission checks) just for a number.
- **Redis health uses `IRedisClient.info()`, not `.ping()`** — BullMQ 5.x's client abstraction
  (over ioredis/node-redis/Bun's built-in client) declares no `ping` method in its interface;
  `info()` is implemented by every adapter and makes an equally real round trip.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Set `ADMIN_BOOTSTRAP_EMAILS=you@example.com` in `apps/api/.env`, sign up/sign in with that email,
  and confirm an "Admin" link appears in the Drive sidebar.
- Visit `/admin/users` — search by email/name, confirm your own row's "Suspend"/"Revoke admin"
  buttons are disabled with an explanatory tooltip, and confirm suspending a *different* user (one
  backed by a real Clerk account) immediately logs them out and blocks their next sign-in attempt.
- Visit `/admin/organizations`, `/admin/audit-logs` (try the event/target filters),
  `/admin/system-health` (confirm Postgres/Redis/S3 all report "Up" with real latencies, and queue
  depth reflects reality), and `/admin/analytics` (toggle the 7d/30d/90d window).
- Confirm a non-admin account gets redirected away from `/admin` client-side, and gets a real 403
  if it calls any `/admin/*` API route directly.

## Verified in this session

- Backend: `pnpm --filter api tsc --noEmit` clean; `pnpm --filter api test` — **94 suites / 382
  tests passing** (34 new this milestone: `AdminGuard`, `SuspendUserUseCase`/
  `UnsuspendUserUseCase`/`SetSystemAdminUseCase` including self-lockout and idempotency,
  `ListAdminUsersUseCase`/`ListAdminOrganizationsUseCase`/`ListAdminAuditLogUseCase`,
  `GetSystemHealthUseCase` covering every up/down permutation, `SyncClerkUserUseCase`'s new
  bootstrap logic, and a new suspension-rejection test in
  `AuthenticateWithClerkTokenUseCase.spec.ts`). `pnpm --filter api test:e2e` — **18 suites / 117
  tests passing**, including a new `admin.e2e-spec.ts` (12 tests) exercising the full guard/
  suspend/unsuspend/role-grant/role-revoke/org-listing/audit-log/system-health/analytics surface
  against a real Postgres/Redis/S3, with `CLERK_CLIENT` DI-overridden so ban/unban calls never hit
  Clerk's real API for fixture-only test users.
- Frontend: `pnpm --filter web tsc --noEmit` and `eslint` both clean.
- Live-verified in the browser signed in as a real admin account (the same Clerk test account
  from prior milestones, promoted via a direct `isSystemAdmin` flag flip — there being no
  self-serve promotion path is exactly the point): the sidebar "Admin" link appears and navigates
  correctly; `/admin/users` lists real database rows, correctly disables the self-suspend/
  self-revoke buttons with tooltips, and the suspend confirmation dialog renders with accurate
  copy; `/admin/organizations` renders its empty state correctly; `/admin/audit-logs` displays
  real cross-user audit entries (including `actor: unknown` for actors whose accounts were since
  deleted — correctly demonstrating `AuditLog.actorId`'s `SetNull` behavior) and the event-type
  filter correctly narrows the list; `/admin/system-health` shows Postgres/Redis/S3 all "Up" with
  real latencies and real BullMQ queue depth (including a genuine historical failed job); and
  `/admin/analytics` renders real stat cards and both SVG line charts against live data.

## Acceptance criteria status

- [x] Only system admins can reach any `/admin/*` route or API endpoint; everyone else gets a
      clean 403 (API) / redirect (frontend) — verified by a dedicated e2e test hitting every
      `/admin/*` route as a non-admin, and live in the browser via the disabled sidebar link
      state (implicitly — a non-admin never sees the link at all, and the layout's route guard
      redirects if the URL is visited directly).
- [x] Suspending a user immediately invalidates their active sessions — Clerk's `banUser` is
      called synchronously before the local flag is set, verified end-to-end in
      `admin.e2e-spec.ts` (a suspended user's very next `GET /users/me` call gets 401).
- [x] System health dashboard accurately reflects real dependency status — verified live against
      the actual local Postgres/Redis/S3 stack (all reporting "Up" with genuine latencies), and
      the use case's unit tests cover every dependency's down/error path individually. A
      deliberately-broken-dependency check (e.g. stopping Redis locally) was not performed live
      this session, but is covered by the unit tests asserting the exact down/error shape
      returned when each underlying call throws.

Milestone 13 is complete for the scope built. Deliberately deferred: an admin UI for editing
`StorageQuota.limitBytes` (M11 already established this as a direct DB/admin action with no
self-serve flow, and this milestone didn't add a form for it either), and any admin-side view into
Drive content itself (by design — see scope decision 4 above). Awaiting your confirmation before
starting Milestone 14.
