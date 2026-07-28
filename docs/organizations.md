# Organizations & Multi-tenancy

NovaDrive's personal Drive (a single-owner tree of folders/files) is unchanged by this milestone.
`Organization`/`Workspace` are a new, entirely additive top-level scope: a `Folder` either belongs
to nobody but its owner (`organizationId`/`workspaceId` both `null`, the personal-Drive case that
has existed since Milestone 2) or to exactly one workspace inside exactly one org. Nothing in the
schema or the resolver forces every folder to pick a side.

## Data model

- **`Organization`** — `id`, `name`, `ownerId`, timestamps. The owner is always an implicit
  `OWNER`-ranked member — no `OrganizationMember` row is ever written for them, the exact same
  convention Folder/File ownership already uses (see `docs/permissions.md`).
- **`Workspace`** — belongs to exactly one `Organization`. Every workspace gets its own root
  `Folder` (`parentId` null, `organizationId`/`workspaceId` set), created **eagerly** by
  `CreateWorkspaceUseCase` in the same call that creates the workspace row — unlike a personal
  root folder, which is created **lazily** on first `GET /folders/root` (`GetOrCreateRootFolderUseCase`).
  The difference: creating a workspace is already a deliberate, admin-level action with no
  "first request" moment to hook lazy creation into the way a brand-new user account has.
- **`OrganizationMember`** — `(organizationId, userId)` unique, `role: PermissionRole`. Reuses the
  exact same role enum (`OWNER`/`ADMIN`/`EDITOR`/`VIEWER`/`GUEST`) resource-level `Permission`
  grants use, rather than inventing a parallel "org role" vocabulary — org roles and resource
  roles share one rank comparison (`roleMeetsMinimum`) throughout the app.
- **`Folder.organizationId` / `Folder.workspaceId`** — both nullable, both set together, inherited
  from the parent at creation time (`CreateFolderUseCase`, `CopyFolderUseCase`) so an org-scoped
  subtree stays workspace-scoped uniformly without every use case walking up to check.
  **`File` deliberately does not get these two columns.** A file's org/workspace scope is always
  its containing folder's — every permission check on a file already resolves through its folder,
  so a denormalized copy on `File` would be a driftable field with no query that needs it. This is
  a deliberate deviation from a literal reading of the roadmap's "Folder/File gain an optional
  organizationId/workspaceId" — documented here rather than carried silently.
- **`Invitation.resourceType`** gained a third value, `ORGANIZATION`, reusing the exact same
  polymorphic `resourceType`/`resourceId` pair `Permission`/`SharedLink`/`Comment` already use
  rather than adding a parallel set of org-invite-only columns. `Permission` itself never receives
  `ORGANIZATION` — org-level access is resolved by `OrgRoleResolver` against `OrganizationMember`,
  never by writing rows into the `Permission` table.

## `OrgRoleResolver`: the org-level analog of `PermissionResolver`

A new domain service, `apps/api/src/modules/organizations/domain/org-role-resolver.service.ts`,
mirrors `PermissionResolver`'s shape but is simpler — an organization has no parent to inherit
from, so there's no ancestor chain to walk:

1. The org owner is always an implicit `OWNER` — no `OrganizationMember` row needed.
2. Otherwise, an explicit `OrganizationMember` row's role applies.
3. No row → no access (`null`); `requireRole` turns that into `ForbiddenException`.

`PermissionResolver.resolveRole` (unchanged for Milestone 0–9 resources) gained exactly one new
step, appended after everything that already existed:

```
resolveRole(actor, 'FOLDER'|'FILE', resourceId)
  1. owner?                          → implicit OWNER   (unchanged since M7)
  2. explicit grant on the resource? → use it            (unchanged since M7)
  3. walk the folder ancestor chain, nearest grant wins   (unchanged since M7)
  4. NEW: folder.organizationId set? → OrgRoleResolver.resolveRole(actor, organizationId)
  5. no grant anywhere               → null → 403
```

Because step 4 only runs after every pre-existing step has already returned nothing, **every
personal-Drive resource (`organizationId` null) takes the exact same code path it always has** —
verified by a dedicated unit test asserting `OrgRoleResolver` is never even called for a
non-workspace folder. `InvitationsModule`'s four use cases (create/accept/revoke/list) each branch
directly on `resourceType === 'ORGANIZATION'` and call `OrgRoleResolver` instead of
`PermissionResolver`, since `PermissionResolver` has no concept of an organization at all.

## Reusing the Drive UI instead of building a parallel one

The roadmap calls for "org-scoped Drive endpoints (list folders/files within a workspace)" — this
milestone deliberately does **not** add new list-folders/list-files endpoints. Once a caller has a
workspace's root folder id (`GET /workspaces/:id/root-folder`, gated VIEWER+ via `OrgRoleResolver`,
otherwise identical in shape to `GET /folders/root`), **every existing M2–M9 endpoint just works**:
`GET /folders/:id/children`, `GET /files?folderId=`, `POST /folders`, uploads, move/copy/delete,
sharing, search — none of them needed to learn about organizations, because `PermissionGuard` +
the extended `PermissionResolver` already authorize org-scoped resources the same way they
authorize shared personal ones. The frontend follows the same principle: a workspace's root folder
renders through the exact same `/drive/[folderId]` page and `DriveView` component personal folders
do. `apps/web/src/app/drive/organizations/` is new (org list, org detail with workspaces +
members), but there is no separate "workspace browser" — clicking a workspace just navigates into
its root folder.

## Cross-scope moves are rejected, not silently corrupted

`Folder.organizationId`/`workspaceId` are set once at creation and inherited by children — but
`PrismaFolderRepository.move` (unchanged since Milestone 5) never re-propagates them onto a moved
subtree. Left alone, moving a folder from personal Drive into a workspace (or between two
workspaces) would leave the moved subtree's `organizationId`/`workspaceId` stale: an org member
would lose access to content that's now "in" their workspace only by virtue of `parentId`, and
content moved back out to personal space would silently keep granting org members access it
shouldn't.

`MoveFolderUseCase` closes this with an explicit guard: a move is rejected with `400` unless the
folder and its destination parent share the same `organizationId`/`workspaceId`. Full re-
propagation (walking and rewriting the moved subtree's scope) was judged out of scope for this
milestone — same-scope moves (personal↔personal, or within one workspace) are unaffected and work
exactly as before. `CopyFolderUseCase`, by contrast, always creates a **new** folder row, so it
was extended to inherit the destination's `organizationId`/`workspaceId` directly (the same
inheritance `CreateFolderUseCase` already does) rather than needing a rejection guard.

## Member management reuses the Milestone 7 invitation machinery

There is no separate "org invite" endpoint. `POST /invitations` with
`resourceType: 'ORGANIZATION'`, `resourceId: <orgId>` follows the identical
create → email (`EmailAdapter` — see `docs/permissions.md`) → accept-by-matching-email flow real
folder/file invitations use, with two differences localized entirely inside the four invitation
use cases:

- **Authorization** branches to `OrgRoleResolver` instead of `PermissionResolver` when
  `resourceType === 'ORGANIZATION'` (`CreateInvitationUseCase`, `RevokeInvitationUseCase`,
  `ListInvitationsForResourceUseCase`).
- **Acceptance** (`AcceptInvitationUseCase`) upserts an `OrganizationMember` row instead of a
  `Permission` row, then reshapes the result into the same `Permission`-like fields
  (`resourceType`/`resourceId`/`role`) the frontend's accept page already reads — so
  `PermissionResponseDto` and the accept page needed zero changes for the new invite kind.

Direct role assignment (`PATCH /organizations/:id/members/:userId`) and removal
(`DELETE /organizations/:id/members/:userId`) are the org-level analogs of
`GrantPermissionUseCase`/`RevokePermissionUseCase`, including the identical escalation guard: the
actor must already outrank (or match) the role they're assigning, enforced by the same
`roleMeetsMinimum` check, emitting the same `PERMISSION_ESCALATION_ATTEMPT` audit event on
failure. The organization owner can never be targeted by either endpoint — attempting to change or
remove the owner is rejected with `400` before any role check even runs.

## Known gaps

- **No cascading scope re-propagation on move** — see above; a folder can only move within its
  current scope, not across the personal/org boundary or between workspaces.
- **Restoring a trashed org folder whose parent was permanently deleted falls back to the actor's
  *personal* root**, not the workspace root — `RestoreFolderUseCase`/`RestoreFileUseCase`'s
  existing fallback (`folders.findRoot(ownerId)`, unchanged since Milestone 6) has no
  workspace-aware equivalent. Narrow (requires the original parent to have been permanently
  deleted independently of the trashed child) but not yet closed.
- **No delete-org/delete-workspace UI** — both DELETE endpoints exist, are permission-checked
  (`OWNER` for org, `ADMIN`+ for workspace), cascade correctly (verified by the schema's
  `onDelete: Cascade` chain), and are covered by backend tests, but no frontend button triggers
  them yet — a deliberate scope cut, not an oversight, given how destructive and rare the action
  is.
- **`SharedLink.visibility: 'ORG'`** (added as a forward-looking placeholder in Milestone 7) is
  still treated identically to `PRIVATE` — wiring `DownloadViaSharedLinkUseCase` to actually check
  org membership for `ORG`-visibility links wasn't part of this milestone's task list.
