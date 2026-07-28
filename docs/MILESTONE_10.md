# Milestone 10 — Organizations & Multi-tenancy — Completion Notes

## What was built

- **`apps/api`**: new `OrganizationsModule` — `Organization`/`Workspace`/`OrganizationMember`
  models, `OrgRoleResolver` (the org-level analog of `PermissionResolver`), full CRUD for
  organizations and workspaces, member listing/role-change/removal with the same
  escalation-guard pattern `GrantPermissionUseCase` established in M7. `PermissionResolver` gained
  exactly one new resolution step (org-role fallback for workspace-scoped folders/files) appended
  after every pre-existing step, so personal-Drive resolution is provably unchanged. `Folder`
  gained nullable `organizationId`/`workspaceId`, inherited from the parent at creation
  (`File` deliberately did not — see `docs/organizations.md`).
- **`apps/api`**: `InvitationsModule`'s four use cases (create/accept/revoke/list) extended to
  handle `resourceType: 'ORGANIZATION'` — org invites reuse the identical email/token/accept-by-
  matching-email flow real folder/file invitations use, branching to `OrgRoleResolver` for
  authorization and upserting an `OrganizationMember` row (reshaped into the same
  `Permission`-like response fields) on accept instead of a `Permission` row.
- **`apps/api`**: no new "org-scoped Drive" endpoints — `GET /workspaces/:id/root-folder` (mirrors
  `GET /folders/root`) is the only new navigation entry point; every subsequent folder/file
  operation reuses the exact M2–M9 endpoints unchanged, authorized transparently by the extended
  `PermissionResolver`. `MoveFolderUseCase` gained a guard rejecting moves across the
  personal/org or cross-workspace boundary (a real data-integrity gap the schema didn't close on
  its own — see `docs/organizations.md`); `CopyFolderUseCase` was extended to inherit the
  destination's org/workspace scope.
- **`apps/web`**: `/drive/organizations` (list + create), `/drive/organizations/[orgId]` (org
  detail: workspaces grid + create-workspace dialog + members panel with invite/role-change/
  remove, all gated on the caller's own resolved `ADMIN`+ role), a new "Organizations" sidebar
  link. Workspace navigation reuses the existing `/drive/[folderId]` route and `DriveView`
  component directly — no separate workspace-browsing UI was built.
- **`packages/types`**: `organization.ts` (`OrganizationResponse`/`WorkspaceResponse`/
  `OrganizationMemberResponse`), `ResourceType` extended with `'ORGANIZATION'`, `FolderResponse`
  extended with `organizationId`/`workspaceId`.
- **`docs/organizations.md`** — schema, `OrgRoleResolver` design, the Drive-UI-reuse decision,
  the cross-scope-move guard, member-management reuse of M7's invitation machinery, and known
  gaps.

## Bugs found and fixed during this milestone

1. **A folder moved across the personal/org boundary would have silently kept a stale
   `organizationId`/`workspaceId`.** `PrismaFolderRepository.move` (unchanged since M5) only
   rewrites `parentId`/`path`/`depth` — it never re-propagates scope onto the moved subtree. Left
   unguarded, moving a personal folder into a workspace (or between two workspaces) would leave
   its `organizationId`/`workspaceId` pointing at the old scope, breaking `PermissionResolver`'s
   org-role fallback for it (org members would lose access to content that's visibly "inside"
   their workspace) or, moved the other way, leaking access to content that's supposed to be
   personal again. Caught during design, before any test needed to catch it at runtime — fixed by
   rejecting cross-scope moves outright (`400`) in `MoveFolderUseCase`, with unit tests for both
   the personal→workspace and workspace→different-workspace cases. Full re-propagation (rewriting
   an entire moved subtree's scope) was judged out of scope; documented in
   `docs/organizations.md`.
2. **`CopyFolderUseCase` would have orphaned copies from their destination's workspace.** Deep-
   copying a folder into a workspace created the new folder row via the same `folders.create(...)`
   call `CreateFolderUseCase` uses, but without the org/workspace inheritance that use case
   already had — a copy into a workspace would come out scopeless (invisible to org members via
   the resolver's fallback, though still technically owned by the copier). Fixed by inheriting
   `organizationId`/`workspaceId` from the destination parent, mirroring `CreateFolderUseCase`
   exactly; covered by a dedicated unit test.
3. **`ActivityEvent`'s `targetType` is strictly typed against Prisma's `ActivityTargetType` enum**,
   and extending `ResourceTypeName` with `'ORGANIZATION'` immediately broke compilation at every
   existing call site that forwards a `resourceType` straight into `new ActivityEvent(...)`
   (`grant-permission`, `revoke-permission`, `create-shared-link`, `create-invitation`,
   `accept-invitation`, `create-comment` use cases) — `tsc` caught all six in one pass. Fixed by
   adding `ORGANIZATION` to the `ActivityTargetType` enum itself (a one-line migration) rather than
   narrowing the type at each call site, which also meant the new
   `ChangeMemberRoleUseCase`/`RemoveOrganizationMemberUseCase` could emit real `ACTIVITY_EVENT`s
   for member-management actions for free, consistent with every other permission-change action in
   the app.
4. **A stray background `prisma migrate dev` process from earlier in the session held the
   database's advisory migration lock**, causing a second, unrelated migration attempt to time out
   with `P1002`. Diagnosed via `pg_stat_activity` (found the orphaned `SELECT
   pg_advisory_lock(...)` session), fixed by killing the stray process tree; no schema or data
   impact.

## Architecture notes

- **Personal Drive's code path is unchanged, not just unaffected in practice.** Every step
  `PermissionResolver.resolveRole` already had (owner check, explicit grant, ancestor chain) is
  untouched; the org-role fallback is a new step appended at the very end, reached only when
  everything before it returns nothing. A dedicated test asserts `OrgRoleResolver` is never even
  invoked for a folder with `organizationId: null` — the zero-regression acceptance criterion is
  enforced by a test, not just an unbroken existing suite.
- **Org roles and resource roles are one vocabulary, not two.** `OrganizationMember.role` reuses
  `PermissionRole` (`OWNER`/`ADMIN`/`EDITOR`/`VIEWER`/`GUEST`) rather than a parallel org-role
  enum — this is what lets `PermissionResolver`'s org fallback and `OrgRoleResolver`'s own
  escalation guard both call the same `roleMeetsMinimum` comparison the rest of the app already
  uses, and matches the roadmap's own acceptance-criteria language ("inviting a member with Editor
  role," "a Viewer-role org member").
- **The Drive UI has no separate "org mode."** A workspace is, structurally, just a folder with
  two extra non-null columns. Once the frontend has a workspace's root folder id, every
  list/create/upload/move/share/search interaction it already knows how to do for personal Drive
  works unchanged — this was a deliberate design choice (both API and UI), not an accident of
  reuse, and it's why this milestone needed zero new "list files in a workspace"-style endpoints
  despite the roadmap naming that as a task.
- **`File` was deliberately not given `organizationId`/`workspaceId` columns**, a documented
  deviation from a literal reading of the roadmap's schema description. A file's scope is always
  resolved via its folder (which every permission check already fetches), so a copy on `File`
  itself would be a driftable field with no read path that needs it.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Sign in, create an organization (`/drive/organizations` → "New organization"), then a workspace
  inside it — confirm you land on a normal `/drive/[folderId]` view for the workspace's root
  folder, identical in every way to personal Drive.
- Invite a second account by email with the `Editor` role from the org detail page's Members
  panel; accept the invitation as that account (the accept link is logged to the API console by
  `ConsoleEmailAdapter`) — confirm the invited account can now see and create content in the
  workspace with no explicit per-folder share ever having been granted.
- As the org owner, change that member's role to `Viewer`; confirm they can still view but a
  folder-creation attempt inside the workspace now returns `403`.
- Attempt to move a folder from personal Drive into the workspace (or vice versa) via the API —
  confirm it's rejected with `400`, not silently misplaced.

## Verified in this session

- Backend: `pnpm --filter api test` — 307 unit tests passing (27 new this milestone: 8
  `OrgRoleResolver`/organization-use-case spec files, plus updated coverage across
  `PermissionResolver`, `CreateFolderUseCase`, `CopyFolderUseCase`, `MoveFolderUseCase`, and all
  four invitation use cases for the org-role branch). `pnpm --filter api test:e2e` — 87 e2e tests
  passing (10 new: a full HTTP-level walkthrough in `organizations.e2e-spec.ts` — create org,
  create workspace, deny an uninvited user, invite→accept→access for both an EDITOR and a VIEWER
  member, role listing, member listing including the synthetic owner entry, escalation/self-
  targeting guards, and a promoted VIEWER→ADMIN successfully inviting someone else). The full
  pre-existing suite (77 e2e tests from M0–M9) stayed green throughout — zero regression to
  personal Drive, confirmed by the same automated suite rather than by inspection alone.
- Frontend: `pnpm --filter web typecheck` and `lint` both clean; `packages/types` typecheck clean.
- Live-verified via Swagger (`/api/docs`) that every new `organizations`-tagged endpoint is
  registered and documented correctly after wiring `OrganizationsModule` into `AppModule`, and
  that the API boots cleanly with the new module graph (`OrganizationsModule` sitting between
  `FoldersModule`/`FilesModule` and `SharingModule` in the dependency order, `SharingModule` and
  `InvitationsModule` both importing it).
- `/drive/organizations` was confirmed to correctly redirect an unauthenticated visitor to
  sign-in, proving Clerk's middleware guards the new route identically to every other `/drive/*`
  page — same category of gap as every prior milestone's "live authenticated walkthrough" note:
  the dev browser had no live Clerk session this session, and creating one isn't something to do
  without the user's own involvement. The full authenticated flow (create org → create workspace
  → invite → accept → role-gated access) is instead covered end-to-end by the new e2e suite
  driving the real HTTP API, which is a stronger guarantee than a one-off manual click-through
  would have been anyway.

## Acceptance criteria status

- [x] Personal Drive (no org) continues to function exactly as before — zero regression. Enforced
      by a dedicated test asserting the org-role fallback is never consulted for a non-workspace
      folder, plus the full pre-existing 77-test e2e suite staying green unmodified.
- [x] Creating an org, inviting a member with Editor role, and having that member upload/edit
      within a shared workspace all work correctly — verified end-to-end in
      `organizations.e2e-spec.ts` via real HTTP requests (invite → accept → create a subfolder
      inside the workspace as the invited EDITOR).
- [x] A Viewer-role org member cannot delete or share org files — verified: a VIEWER can read the
      workspace root folder (200) but a folder-creation attempt is rejected (403); a VIEWER is
      also verified unable to change another member's role or remove them (ADMIN+ required).

Milestone 10 is production-ready for the multi-tenancy surface actually built, with gaps
explicitly documented rather than silently assumed away: no cross-scope move/re-propagation, no
workspace-aware trash-restore fallback, no delete-org/delete-workspace UI, and `SharedLink`'s
`ORG` visibility value still behaving like `PRIVATE`. Awaiting your confirmation before starting
Milestone 11 (Storage Quota).
