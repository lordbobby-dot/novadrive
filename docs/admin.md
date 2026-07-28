# Admin Panel

`isSystemAdmin` is a flat, platform-wide boolean on `User` — distinct from every per-resource
`Permission` role and every `OrganizationMember` role in the schema. It grants access to
`/admin/*` only; it has no bearing on what an admin can do inside any specific Drive, folder,
file, or organization (an admin who isn't a member of an org still can't browse its files —
`AdminModule` only ever exposes aggregate/management views, never a backdoor into content).

## Becoming the first admin

There's no self-serve "become an admin" flow — a fresh install has zero admins by design.
`ADMIN_BOOTSTRAP_EMAILS` (comma-separated, in `apps/api/.env`) is checked on every Clerk sync
(`SyncClerkUserUseCase`, both the webhook path and the lazy defensive-fallback path in
`AuthenticateWithClerkTokenUseCase`): if a synced user's email matches the list and they aren't
already an admin, they're granted the role. This is a **grant-only** check — removing an email
from the list later does not revoke an existing admin, and an admin promoted through the panel
itself (an email never in the bootstrap list) is never touched by it. Every admin after the first
is promoted from within `/admin/users` itself.

## The `AdminGuard` pattern

Modeled on `PermissionGuard` (metadata-driven, registered globally via `APP_GUARD`, a no-op
everywhere it isn't opted into) rather than on `ClerkAuthGuard`'s unconditional check — but far
simpler than `PermissionGuard`, since `isSystemAdmin` is a flat flag with no per-resource
resolution needed:

```ts
@RequireAdmin()
@Controller('admin/users')
export class AdminUsersController { ... }
```

`AdminGuard.canActivate` reads the `@RequireAdmin()` metadata via `Reflector.getAllAndOverride`
(handler then class); if absent, it's a no-op (`return true`); if present, it checks
`request.user.isSystemAdmin` and throws `ForbiddenException` otherwise. It runs after
`ClerkAuthGuard` in the guard chain, so `request.user` is already populated by the time it runs —
identical ordering assumption to `PermissionGuard`.

## Suspending a user

`PATCH /admin/users/:id/suspend` does two things, in order:

1. Calls Clerk's `banUser(clerkId)` — per Clerk's own docs, this **immediately revokes every
   live session** for that user and blocks further sign-in. This alone satisfies the acceptance
   criterion ("suspending a user immediately invalidates their active sessions").
2. Sets `User.isSuspended = true` locally, as **defense in depth**: `ClerkAuthGuard` (via
   `AuthenticateWithClerkTokenUseCase`) checks this flag on every authenticated request and
   rejects with 401 even if a JWT that was minted just before the ban propagated is still
   cryptographically valid. Belt-and-suspenders, not redundant — the two checks close different
   gaps (Clerk's own session revocation vs. a narrow token-validity race).

Both directions (`suspend`/`unsuspend`) are idempotent — suspending an already-suspended user is a
no-op that doesn't re-call Clerk's API or re-write the timestamp. `unsuspend` mirrors this with
`unbanUser`.

**Self-lockout protection**: an admin can never suspend their own account or revoke their own
admin role (`SuspendUserUseCase`/`SetSystemAdminUseCase` both reject with 400). Without this, the
only admin on a fresh install could accidentally lock out the entire platform with no other admin
able to reverse it — the same rationale as Milestone 10's guard against an organization owner
removing/demoting themselves. An admin *can* suspend or demote a *different* admin.

Every suspend/unsuspend/role-grant/role-revoke action writes an `AuditLog` entry
(`USER_SUSPENDED`/`USER_UNSUSPENDED`/`ADMIN_ROLE_GRANTED`/`ADMIN_ROLE_REVOKED` — four new
`AuditEventType` values added this milestone), with the acting admin as `actorId` and the affected
user as `targetId`/`targetType: "USER"` — visible in `GET /admin/audit-logs`.

## Overriding a user's storage quota

`PATCH /admin/users/:id/quota` (`{ limitBytes: "5000000000" }`, a decimal-string byte count —
see [`docs/quota.md`](quota.md) for why `StorageQuota.limitBytes` is a string, not a `number`, on
the wire) lets an admin set an exact quota for a specific user, overriding whatever
`DEFAULT_USER_QUOTA_BYTES` would otherwise apply on their next upload.

Reuses `StorageQuotaRepository`'s existing `subjectType_subjectId` unique constraint via a new
`setLimit` method — an upsert that creates the row (with `usedBytes` starting at 0) if the user has
never attempted an upload, or updates just `limitBytes` on an existing row without touching
`usedBytes`. This is deliberately a different operation from `getOrCreate` (used by the real
reservation path in `QuotaService.reserve`), which only ever applies the *default* limit and is a
no-op if a row already exists — an admin override always wins, whether or not a row is there yet.

`GET /admin/users` now also returns each user's `storageUsedBytes`/`storageLimitBytes` (batched via
`findManyBySubjects`, the same pattern `GET /admin/organizations` already used for org storage
summaries — one query for the whole page, not one per row), so the admin UI can show current usage
next to the button that opens the override dialog without a second round trip.

`limitBytes` must be a positive integer (`0` or negative is rejected with 400) — validated at two
layers: `class-validator`'s `@IsNumberString` on the DTO catches non-numeric input before it ever
reaches the use case, and `SetUserQuotaUseCase` itself re-checks positivity as a `BigInt` comparison
(a numeric *string* passing `@IsNumberString` doesn't guarantee positive). Writes a
`USER_QUOTA_UPDATED` audit log entry, same actor/target convention as suspend/role-change.

Organizations have the equivalent control too — see "Organization admin actions" below.

## Organization admin actions

Organizations were originally read-only in the admin panel (list + usage summary only). Six
admin-gated actions were added, all living in `AdminModule` rather than reusing `OrganizationsModule`'s
self-service use cases — deliberately: `DeleteOrganizationUseCase`, `ListOrganizationMembersUseCase`,
`ChangeMemberRoleUseCase`, `RemoveOrganizationMemberUseCase`, etc. all call
`OrgRoleResolver.requireRole(actorId, ..., <role>)` first, which would 403 an admin who isn't
themselves a member of the org being acted on. `AdminGuard` is these endpoints' only authorization
boundary, so each admin-panel action is its own small use case with direct repository access,
matching the pattern `SetUserQuotaUseCase`/`SuspendUserUseCase` already established.

- **`GET /admin/organizations/:id`** — full detail: the organization (with the same
  `storageUsedBytes`/`storageLimitBytes` fields the list view has), every member (owner included,
  via the same synthetic-`OWNER`-entry trick `ListOrganizationMembersUseCase` uses), and every
  workspace. `GetAdminOrganizationDetailUseCase` duplicates rather than reuses that trick, for the
  same 403-avoidance reason above.
- **`PATCH /admin/organizations/:id/quota`** — sets `StorageQuota.limitBytes` for the
  `ORGANIZATION` subject, identical validation/audit pattern to the per-user version above
  (`ORGANIZATION_QUOTA_UPDATED`).
- **`PATCH /admin/organizations/:id/owner`** (`{ newOwnerId }`) — there is no self-service
  ownership transfer anywhere in this app; this is the only way to move an organization to a
  different owner. Deliberately allows transferring to *any* existing user, not only current
  members — an admin's authority is meant to cover recovery scenarios (e.g. the original owner's
  account was suspended) where requiring prior membership would make the org permanently
  unrecoverable. The previous owner is downgraded to an explicit `ADMIN` member row rather than
  losing access outright (the owner is otherwise always implicit-never-a-row, per
  `OrgRoleResolver`); if the new owner already held a member row, it's removed, since they become
  the new implicit owner. Idempotent if `newOwnerId` already owns the org. Audits
  `ORGANIZATION_OWNER_TRANSFERRED` with both the previous and new owner ids in `metadata`.
- **`DELETE /admin/organizations/:id`** — the admin-panel counterpart of the self-service
  OWNER-only delete, same irreversible cascade (via the DB schema) to every workspace/folder/file
  inside it, but callable by an admin regardless of who owns the org. Audits
  `ORGANIZATION_DELETED` with the org's name and owner id (both otherwise gone the moment the row
  is deleted).
- **`PATCH /admin/organizations/:id/members/:userId`** (`{ role }`) — changes a member's role
  directly. `AdminChangeMemberRoleUseCase` skips `ChangeMemberRoleUseCase`'s own
  `roleMeetsMinimum(actorRole, role)` escalation guard entirely rather than duplicating it — that
  guard exists to stop one *collaborator* from out-ranking another, which doesn't apply here since
  `AdminGuard` (system-admin-only) is already a strictly higher bar than any org role. `OWNER` is
  rejected (400) at both the DTO (`AdminChangeMemberRoleDto`'s `@IsIn`) and use-case level —
  ownership moves only through `PATCH .../owner` above, never a plain role change — and the
  org's actual owner can't be targeted either. Audits `ORGANIZATION_MEMBER_ROLE_CHANGED`.
- **`DELETE /admin/organizations/:id/members/:userId`** — removes a member directly, same
  bypass-OrgRoleResolver reasoning. Can't target the owner. Audits
  `ORGANIZATION_MEMBER_REMOVED`.

The frontend's organization list rows now link to `/admin/organizations/:id`, which surfaces all
six actions plus the member/workspace lists the API already returned but no page displayed — the
member list itself is no longer read-only: every non-owner row gets a role `<select>`
(`ADMIN`/`EDITOR`/`VIEWER`/`GUEST`) and a remove button, the same `RoleSelect`-and-`X`-button shape
the self-service Share dialog's People tab already uses (see docs/permissions.md).

## Admin-wide queries vs. personal-scoped queries

Three existing modules gained a second, unscoped query path rather than being replaced:

- **`AuditLogRepository.list`**: `actorId` widened from required to optional. The personal
  `GET /audit-log` endpoint still always passes the current user's id (unchanged behavior);
  `GET /admin/audit-logs` can omit it entirely for "everyone's trail," or pass any `actorId` to
  inspect one specific user. A new `targetType` filter (e.g. `"USER"`) was added alongside it.
- **`OrganizationRepository.listAll`**: a new method distinct from `listForActor` (which stays
  membership-scoped for the org switcher). Returns every organization on the platform with
  `_count`-derived `memberCount`/`workspaceCount` — computed via Prisma's relation-count feature
  in the Prisma-layer repository, not hand-rolled in the use case.
- **`StorageQuotaRepository.findManyBySubjects`**: a batched counterpart to the existing
  single-subject `findBySubject`, used by `ListAdminOrganizationsUseCase` to resolve every
  returned org's usage in one round trip rather than one query per org.

`UserRepository` gained genuinely new methods (`list`, `setSystemAdmin`, `setSuspended`) — there
was no existing admin-wide user listing to widen.

## System health: the first real connectivity-check code in the repo

M0's `GET /health` is a pure liveness stub (`{status: 'ok'}`, no dependency checks) — a real
`/health/ready` probing Postgres/Redis/S3 is explicitly Milestone 14's job. `GET /admin/system-health`
is *not* that endpoint: it's admin-gated, richer (queue depth, not just up/down), and lives in
`AdminModule` rather than `HealthModule`. Each check:

- **Database**: `SELECT 1` via `PrismaService.$queryRaw`, timed.
- **Redis**: `IRedisClient` (BullMQ's client abstraction over ioredis/node-redis/Bun) has no
  `ping` method — every adapter implements `info()` instead, which is used as the liveness probe
  (a genuine round trip that fails identically if the connection is down).
- **S3**: `HeadBucketCommand` against `AWS_S3_BUCKET`; reports down with a clear message if the
  bucket isn't configured at all, rather than attempting a call that would fail confusingly.
- **Queues**: `AdminModule` registers the *same two* named queues (`checksum-verification`,
  `trash-cleanup`) a second time via `BullModule.registerQueue` — same underlying Redis
  connection/queue name as `UploadsModule`/`TrashModule` already use, just a second DI handle —
  so this module can read `getJobCounts()` without importing either module's much larger
  dependency tree (S3 adapter, virus scanning, permission checks, etc.) just to get a number.

## Analytics: what's exact vs. approximate

`GET /admin/analytics?windowDays=` returns three kinds of numbers with different honesty levels:

- **`totalUserCount`, `totalOrganizationCount`**: exact, unwindowed `COUNT(*)`.
- **`activeUserCount`**: exact for its stated definition — `COUNT(DISTINCT actorId)` from
  `Activity` within the window. "Did something," not "signed in" — `Activity` (not `AuditLog`'s
  `LOGIN` events) is the broadest per-action signal already in the schema.
- **`signupsByDay`**: exact per-day `User.createdAt` counts.
- **`storageGrowthByDay`**: a **cumulative running total of bytes uploaded** (`COMPLETED`
  `StorageObject` rows only), computed via a windowed `SUM(...) OVER (ORDER BY day)` SQL query.
  This is explicitly *not* "bytes currently stored" — there's no historical snapshot table, so
  deletions are never reflected and the line can only go up. Documented in the response type's
  own doc-comment and surfaced in the UI copy ("never decreases — deletions aren't reflected")
  rather than presented as if it were live storage usage.

## Frontend

- `/admin/*` sits in its own route group with its own `layout.tsx` (header + `AdminSidebar`), not
  nested under `/drive` — the drive layout hardcodes drive-specific chrome (search bar, upload
  panel) that has no place in an admin section.
- **`AdminRouteGuard`** is a client-side convenience only — it redirects a non-admin to `/drive`
  after `useCurrentUser()` resolves, purely so a non-admin doesn't sit staring at a half-rendered
  admin page before being sent back. It is **not** the authorization boundary; `AdminGuard` on the
  API 403s every `/admin/*` request regardless of what this component does or doesn't render.
  `middleware.ts` gained `/admin(.*)` in its protected-route matcher (authentication only, same as
  every other protected route — Clerk middleware has no cheap way to check a Postgres-backed
  `isSystemAdmin` flag without a round trip, so role gating stays client-side + server-enforced
  rather than middleware-enforced).
- The sidebar's "Admin" link (`components/drive/sidebar.tsx`) only renders when
  `useCurrentUser().data.isSystemAdmin` is true — hidden, not disabled, for everyone else.
- No charting library was introduced — `SimpleLineChart` is hand-rolled SVG (a `<polyline>` over
  normalized points), the same "one or two small charts don't justify a new dependency" call
  Milestone 11 made for the storage-usage donut.
- User management, org listing, and audit-log filtering all reuse this project's established
  cursor-pagination UI pattern (local `cursor`/`accumulated` state + "Load more"), the same shape
  `AuditLogList`/`SearchResults`/`FavoritesPage` already use.

## Known gaps (documented, not silently assumed away)

- **Suspending a user could not be fully live-verified against a real Clerk account in this
  session** beyond the UI/confirm-dialog layer — the only two real Clerk-backed test accounts
  available were the acting admin (self-suspend is correctly blocked) and fixture rows from prior
  e2e runs whose `clerkId`s don't correspond to real Clerk users (calling `banUser` on one would
  hit Clerk's real API and 404). The actual ban/unban + local-flag + audit-log logic is instead
  covered by `test/admin.e2e-spec.ts` against a DI-overridden `CLERK_CLIENT` stub, which is a
  stronger, deterministic correctness guarantee for the business logic than one more manual click
  would have added — but a real-Clerk-account suspend was not clicked through live.
- **No pagination limit warning on `/admin/analytics`'s date-bucketed queries** — at very large
  scale (millions of `StorageObject`/`User` rows), the raw `GROUP BY date_trunc(...)` queries have
  no index tuned specifically for them (they scan `createdAt` ranges, which is indexed, but the
  `GROUP BY` itself isn't). Fine at this project's current scale; worth revisiting if analytics
  ever needs to run against a genuinely large dataset.
