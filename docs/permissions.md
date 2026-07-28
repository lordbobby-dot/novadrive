# Permissions & Sharing

NovaDrive has two independent access mechanisms that layer on top of each other:

- **RBAC (`Permission`)** — a role per (subject, resource), resolved with tree inheritance down
  the folder hierarchy. This is "who can do what" for authenticated users.
- **`SharedLink`** — a public, token-based URL, independent of RBAC. This is "anyone with the
  link" access, optionally password-gated, expiring, and download-limited.

Both are read by the same `PermissionResolver` (for RBAC) or `SharedLinkRepository` (for links);
neither module knows about the other.

## RBAC matrix

Five roles, ranked strictly:

| Role   | Rank | View | Comment | Edit (rename/move/upload) | Manage access (grant/revoke/invite/links) | Delete |
| ------ | :--: | :--: | :-----: | :------------------------: | :----------------------------------------: | :----: |
| OWNER  |  4   |  ✓   |    ✓    |             ✓              |                     ✓                      |   ✓    |
| ADMIN  |  3   |  ✓   |    ✓    |             ✓              |                     ✓                      |   ✓    |
| EDITOR |  2   |  ✓   |    ✓    |             ✓              |                                              |        |
| VIEWER |  1   |  ✓   |    ✓    |                              |                                              |        |
| GUEST  |  0   |  ✓   |         |                              |                                              |        |

"Rank" is what `roleMeetsMinimum(role, minimum)` compares — a single integer comparison rather
than a lookup table of every pairwise combination
([`permission.entity.ts`](../apps/api/src/modules/sharing/domain/permission.entity.ts)).

The resource **owner is always an implicit OWNER** — no `Permission` row is ever created for
them. Every other role requires an explicit grant (direct or inherited).

Two roles are asymmetric with their neighbor on purpose:

- **Commenting only requires VIEWER+**, not EDITOR+ — it's lightweight collaboration, not a
  content edit, so it sits at read-tier, not write-tier.
- **Deleting a comment you didn't author requires ADMIN+**, one tier above resolving one
  (EDITOR+) — moderating other people's comments is a more elevated action than marking your own
  thread resolved. The comment's own author can always resolve or delete their own comment
  regardless of role.

## Inheritance algorithm

`PermissionResolver.resolveRole(actorId, resourceType, resourceId)` — the single source of truth
every guard and sharing-aware use case calls, rather than querying the `Permission` table
directly:

1. **Resource owner** → implicit `OWNER`, no row lookup needed beyond confirming `ownerId`.
2. **Explicit grant directly on the resource** → always wins over anything inherited, regardless
   of what an ancestor grants.
3. **Otherwise, walk the containing folder's ancestor chain, nearest-first.** The first ancestor
   with an explicit grant for this subject wins. This is **"nearest override wins," not "most
   permissive wins"** — a VIEWER grant on the immediate parent overrides an ADMIN grant three
   levels up, on purpose. One batched query
   (`PermissionRepository.findManyForSubject`) resolves the whole chain, not one round trip per
   level.
4. **No grant anywhere in the chain** → `null` (no access). `requireRole` turns that into a
   `ForbiddenException`; it never leaks whether the resource exists to someone with no access —
   see [Anti-enumeration](#anti-enumeration-a-security-property-not-just-ux) below.

```
requireRole(actor, 'FOLDER', child.id, 'EDITOR')
  → resolveRole
      child has an explicit grant for actor?          → use it, stop
      else walk ancestors nearest→root:
        parent has an explicit grant for actor?        → use it, stop
        grandparent has an explicit grant for actor?    → use it, stop
        ...
      → no grant found anywhere               → null → 403
```

A file's chain starts from its own explicit grant, then falls through to its **containing
folder's** chain (a file has no descendants of its own to check first).

## Guard-based authorization, not query-scoped authorization

Every M2–M6 read/write path was originally `repository.findById(id, ownerId)` — a query that
silently returns nothing for anyone but the owner. Sharing requires two structural changes,
applied uniformly across Folders/Files/Downloads/Versions/Tags/Uploads/DriveOperations:

- **`findByIdUnscoped(id)`** — a second lookup method with no owner filter, used once
  `PermissionGuard` has already authorized the request. `PermissionResolver` itself needs this
  too (it must be able to fetch a resource's `ownerId` even when the caller isn't the owner —
  that's the entire point of sharing).
- **`@RequirePermission({ resourceType, minimumRole, source, field })`** — a declarative,
  stackable decorator read by a single global `PermissionGuard` (registered via `APP_GUARD`,
  same pattern as `ClerkAuthGuard`). `source` says where the resource id comes from
  (`params`/`body`/`query`); `optional: true` skips the check when the field is absent (e.g.
  `versionOfFileId` on upload-complete, which is mutually exclusive with `folderId`). Guards run
  in Nest's declared order, so `ClerkAuthGuard` always populates `request.user` before
  `PermissionGuard` runs.
- **Move/copy/delete check both ends.** Moving a file into another folder needs two checks
  stacked on one route — EDITOR on the file being moved *and* EDITOR on the destination folder.

A route with no `@RequirePermission` decorator is unaffected — `PermissionGuard` is a no-op
without it, same as `ClerkAuthGuard`'s `@Public()` escape hatch.

### Consequence: listing queries scope by structural key, not by owner

A folder's children can now belong to a different owner than the folder itself — a collaborator
with EDITOR+ can create files/folders inside someone else's shared folder, and the creator owns
what they create (see [Ownership](#ownership-never-changes-after-creation) below). So
`findChildren`/`findByFolder`/`findDescendantIds` dropped their `ownerId` WHERE clause entirely,
scoping purely by `parentId`/`folderId`/materialized-path prefix instead. This is safe without an
owner filter because `PermissionGuard` has already authorized access to the *container* before
the query runs, and the structural key (a globally-unique cuid, or a path prefix that embeds
one) can't accidentally cross into an unrelated owner's subtree.

`ownerId` parameters on these methods didn't disappear from the interfaces — they were
repurposed. `softDeleteByFolderIds(folderIds, ownerId)` still takes one, but it's now "which
owner's Trash bin to file every row under," not "which owner's files to find." See
[Delete files under the resource's real owner](#delete-files-under-the-resources-real-owner-not-the-deleting-actor).

## Ownership never changes after creation

Three ownership rules, chosen for simplicity over alternatives that would have required
cascading reassignment logic:

1. **A newly created file/folder is owned by its creator**, not by the parent folder's owner. If
   a collaborator with EDITOR access creates a file inside someone else's shared folder, that
   collaborator owns the new file. Avoids surprising a collaborator that something they made
   belongs to someone else.
2. **A copy is owned by whoever copied it** (the actor), for the same reason — `CopyFileUseCase`
   / `CopyFolderUseCase` only need VIEWER+ on the source (read access) and EDITOR+ on the
   destination (write access); the new rows are created under the copying actor's ownership.
3. **Moving a file or folder never reassigns ownership.** A folder and its entire subtree keep
   whichever owners they already had after a move — no cascading `UPDATE` needed, and no
   "who owns this now" ambiguity to resolve for a subtree that may already span multiple owners.

## Delete files under the resource's real owner, not the deleting actor

`Trash.ownerId` decides whose Trash bin a deleted item shows up in and who can restore it. If a
collaborator with EDITOR+ deletes a file or folder they don't own, filing the Trash row under the
*deleting actor* would mean the row is invisible to the actual owner — and becomes permanently
orphaned if that collaborator's access is later revoked.

`DeleteFileUseCase`/`DeleteFolderUseCase` fetch the resource unscoped, then file the Trash
row(s) under `resource.ownerId` (the real owner) while still attributing the `ActivityEvent` to
the acting collaborator, so the audit trail and the trash-bin ownership stay correctly separate.
For a recursive folder delete, the *entire* subtree — regardless of which individual descendant
belongs to which creator — is filed under the root folder's own owner, so it lands in one
consistent Trash bin rather than being split across however many creators happened to touch it.

**Explicitly out of scope**: Trash restore/permanent-delete remain owner-only, unchanged from
before sharing existed. Whether a collaborator who deleted someone's file should be able to
restore it later — even after their own access is later revoked — has no clean answer and wasn't
invented; Trash stays private to the resource's real owner.

## `SharedLink`: public, token-based, independent of RBAC

A `SharedLink` grants access to anyone with the URL, with no relationship to the `Permission`
table. Creating or revoking one is itself an RBAC action — it requires ADMIN+ on the resource,
the same threshold as granting/revoking a `Permission`, since a link effectively hands access to
an unbounded set of people.

- **Password**: salted `scrypt` (Node's built-in `crypto`, no new dependency) — a
  link password is a low-stakes secret compared to an account password, not worth pulling in
  bcrypt/argon2 for.
- **Expiry and download limit** are both optional and independent. `GET /shared-links/:token`
  (viewing the landing page) does **not** count against the download limit — only
  `POST /shared-links/:token/download` does, since a page refresh shouldn't burn quota.
- **Atomic download-limit enforcement.** The increment is a single conditional
  `UPDATE ... SET "downloadCount" = "downloadCount" + 1 WHERE "downloadCount" < "maxDownloads"
  RETURNING *` — not a read-then-write — so two concurrent requests arriving exactly at the limit
  can't both succeed. Covered by an e2e test that fires several concurrent download requests
  right at the limit and asserts only the allowed number succeed.

### Anti-enumeration: a security property, not just UX

An expired link and a token that never existed return **byte-for-byte identical** 404 responses.
A wrong password and a missing password both return the same `SharedLinkPasswordRequiredException`
(403) rather than distinguishing "wrong" from "you didn't try." This means a password-guessing
attempt against a real, live token can't be used to first confirm the token exists before
brute-forcing the password — the two failure modes (nonexistent token, unauthenticated request to
a real one) are indistinguishable from the outside. Verified by a dedicated unit test asserting
the exact response shape is identical in both cases, and by an e2e test comparing the two
response bodies directly.

Folder links currently only resolve to metadata (name, type) — there's no endpoint to browse a
shared folder's contents via a link. Building that would need a link-scoped listing endpoint
honoring the link's own `canView` flag rather than RBAC, which wasn't part of this milestone's
scope.

## `Invitation`: email-addressed, async accept

Invitations are the path for inviting someone who may not have an account yet, as opposed to a
direct `Permission` grant (`POST /permissions`), which requires already knowing the invitee's
user id. Creating one requires ADMIN+ on the resource, same as a direct grant.

- **Acceptance is resolved by authenticated-email match, not by any invite-time user
  provisioning.** `POST /invitations/:token/accept` requires the *signed-in* user's email to
  case-insensitively match the invitation's email. This is what makes "a brand-new user signs
  up via the emailed link, then lands with the role already applied" work without the backend
  ever needing to pre-create a user record for someone who doesn't exist yet.
- **The frontend's accept page (`/invitations/:token`) is a protected route** — Clerk's
  middleware redirects an unauthenticated visitor through sign-in/sign-up and back to the same
  URL automatically, so by the time the page's own code runs, `POST /invitations/:token/accept`
  always has an authenticated actor.
- **The bearer token is never returned from `POST /invitations`.** Only the emailed accept link
  (built server-side as `${CORS_ORIGIN}/invitations/${token}`) carries it — the inviter (who
  calls the create endpoint) has no legitimate reason to see or reuse the invitee's accept
  token. `GET /resources/:type/:id/invitations` (listing pending invites) also omits it for the
  same reason.
- **An invitation transitions through `PENDING → ACCEPTED | EXPIRED | REVOKED`.** An accept
  attempt on an already-expired invitation transitions it to `EXPIRED` as a side effect of the
  failed accept (not on a schedule), then rejects — so the status reflects reality the next time
  anyone looks, without needing a cleanup job.
- **Real email delivery** — `ResendEmailAdapter` (`apps/api/src/modules/invitations/infrastructure/resend-email.adapter.ts`)
  sends invitation email via the Resend HTTP API using Node's built-in `fetch` (no SDK dependency
  for a single POST). `InvitationsModule` binds `EMAIL_ADAPTER` to it or to `ConsoleEmailAdapter`
  (log-only, the default) via a `useFactory` reading `EMAIL_PROVIDER` at boot — exactly the one
  binding the `EmailAdapter` port was designed to make swappable, no use case changed.
  `env.validation.ts` enforces `RESEND_API_KEY`/`EMAIL_FROM` are both set whenever
  `EMAIL_PROVIDER=resend`, failing fast at startup rather than on the first invitation. The email
  body escapes `inviterName`/`resourceName`/`role` before interpolating them into HTML, since all
  three are user-controlled (a display name or a file/folder name).

## `Comment`

Comments attach to a `resourceType`/`resourceId` pair directly (no polymorphic association
table beyond the `ResourceType` enum reused from `Permission`/`SharedLink`/`Invitation`).
Creating one requires VIEWER+; resolving requires the author or EDITOR+; deleting requires the
author or ADMIN+ (see the [RBAC matrix](#rbac-matrix) note above for why those two thresholds
differ). Listing comments enriches each row with the author's display email/name via a single
batched `User.findByIds` lookup — a `Comment` row only stores a bare `authorId` otherwise.

## Activity: two feed modes

`GET /activity` behaves differently depending on whether `targetId` names a shareable resource:

- **No `targetId`, or a non-shareable `targetType` (`ACCOUNT`)** — the account-level "my
  activity" feed, scoped to the viewer's own actions only. Inherently personal; no permission
  check applies.
- **`targetId` + `targetType` `FILE`/`FOLDER`** — the per-resource feed (opened from a file's
  "History…" panel), gated on the viewer having VIEWER+ on that specific resource via
  `PermissionResolver`. Once authorized, it shows **every** actor's activity on that resource,
  not just the viewer's own — a collaborator should see the resource's full history, matching
  what "History" implies.

## Enriching bare ids for display

Several list responses only had a raw foreign-key id where a human-readable name was needed once
sharing made "who" a meaningful question:

- `GET /resources/:type/:id/permissions` — each grant now carries `subjectEmail`/`subjectName`.
- `GET /comments/...` — each comment now carries `authorEmail`/`authorName`.

Both are resolved with one batched `UserRepository.findByIds(ids)` call per list response
(never one query per row), added specifically to support the frontend's Share dialog and comment
panel rather than existing from the initial `SharingModule`/`CommentsModule` build.

## Ownership transfer

The Share dialog's role picker (both the "invite by email" selector and the per-collaborator
`RoleSelect` used to change an existing grant) now includes `OWNER` — picking it for an existing
collaborator *is* the ownership-transfer affordance, and inviting a brand-new collaborator
straight in as `OWNER` works the same way. No new backend endpoint was needed: `POST /permissions`
and `POST /invitations` already accepted any `PermissionRoleName` including `OWNER`, gated by the
same escalation guard `GrantPermissionUseCase` already had (an `ADMIN`+ granter can only hand out a
role up to their own rank — an `ADMIN` still can't mint an `OWNER`).

**Bug fixed alongside this**: `CreateInvitationUseCase` had never actually enforced that guard —
it required `ADMIN`+ to invite at all, but never compared the inviter's own resolved role against
the role being invited at, unlike `GrantPermissionUseCase`/`ChangeMemberRoleUseCase`, which both do.
In practice this meant an `ADMIN`-level collaborator could invite a brand-new user directly as
`OWNER` through `POST /invitations` even though the identical direct-grant path
(`POST /permissions`) already blocked exactly that escalation. Now both paths run the same
`roleMeetsMinimum(inviterRole, role)` check and emit `PERMISSION_ESCALATION_ATTEMPT` on failure,
for both `FILE`/`FOLDER` and `ORGANIZATION` invites.

Note that granting `OWNER` via sharing is permission-equivalent access only — it does not touch
the file/folder's actual `ownerId` column, which still exclusively controls quota attribution and
Trash rights (see "Trash stays owner-private" below). There remains no way to reassign that column
itself for an individual file/folder (unlike Organizations, which do have a real
`PATCH /admin/organizations/:id/owner`, per docs/admin.md) — granting `OWNER` permission is the
full extent of "ownership transfer" for files/folders in this app.

## Browsing a shared folder via a public link

A `SharedLink` with `resourceType: FOLDER` used to resolve metadata only — the folder's name and
flags, with no way to see what was actually inside it. `SharedFolderAccessResolver`
(`apps/api/src/modules/sharing/domain/shared-folder-access-resolver.service.ts`) now backs three
additional `@Public()` routes on `SharedLinksController`, each rate-limited the same as the
existing metadata/download routes (10/min):

- `GET /shared-links/:token/folders` — subfolders of the shared root (or of a descendant, via
  `?folderId=`), reusing `FolderRepository.findChildren`.
- `GET /shared-links/:token/files` — files directly inside that folder, reusing
  `FileRepository.findByFolder`.
- `GET /shared-links/:token/breadcrumb` — the chain from the shared root down to the current
  folder only. It never reveals anything above the shared root: `GetSharedFolderBreadcrumbUseCase`
  slices the materialized-path ancestor chain (`parseAncestorIds`/`isSelfOrDescendant`, the same
  helpers `folder.entity.ts` already exposes for the self-service tree) starting at the link's own
  `resourceId`, so a browser can never learn anything about the owner's real Drive hierarchy.

Every `folderId` passed to these routes is validated as the shared root itself or a descendant of
it before anything is returned; a `folderId` outside the subtree 404s exactly like an unknown
token, rather than 403ing in a way that would confirm the folder exists.

`GET /shared-links/:token/download` was extended to accept an optional `fileId` in its body. For a
FOLDER-type link, `fileId` is now required; `DownloadViaSharedLinkUseCase` resolves the file and
confirms its `folderId` is the shared root or a descendant of it (again via `isSelfOrDescendant`)
before presigning — and only increments the link's download counter *after* that check passes, so
a guessed/foreign `fileId` can't burn down `maxDownloads` before 404ing.

The response DTOs (`SharedFolderItemResponseDto`, `SharedFileItemResponseDto`) follow the same
"reveal nothing about the owner" principle as `SharedLinkAccessResponseDto`: just `id`/`name`
(and `contentType`/`size` for files) — no `ownerId`, `organizationId`, `workspaceId`, or
timestamps. The web client (`SharedFolderBrowser`) starts with an undefined `folderId` (the
metadata call never exposes the root folder's real id) and navigates purely by ids returned from
these endpoints.

## Shared with Me

The sidebar's "Shared with Me" entry used to be a disabled placeholder. `GET /shared-with-me`
(`PermissionsController`, `ListSharedWithMeUseCase`) now lists files and folders **directly**
granted to the caller by someone else — deliberately scoped to exclude two things that would
otherwise make it noisy or redundant:

- **Org/workspace-wide access** — a role coming from `OrganizationMember` rather than a `Permission`
  row is already surfaced by the `/drive/organizations` UI, so it's left out here. This list only
  ever reflects rows in the `Permission` table.
- **Resources the caller owns** — `PrismaPermissionRepository.listGrantedToSubject` filters
  `ownerId != subjectId`, defensively; a direct grant to yourself shouldn't exist, but this keeps
  the query correct if it ever did.

The query (`listGrantedToSubject`) is a raw-SQL `UNION ALL` join of `Permission` against `File` and
`Folder`, offset-paginated the same way `PostgresSearchService.listFavorites` is — see
[docs/search.md](search.md) for why offset pagination is deliberate for this family of endpoints
rather than the app's usual id-cursor scheme. Each row's `ownerId` is then batch-resolved to a
display name via `UserRepository.findByIds`, one extra query for the whole page rather than one per
row — the same pattern `ListPermissionsForResourceUseCase` already used for `subjectId` in the
Share dialog's "People" tab.

**Frontend click behavior differs by type** (`SharedWithMeList`): clicking a shared **folder**
navigates into `/drive/:id`, same as everywhere else. Clicking a shared **file** downloads it
directly via `useDownloadFile()` instead of navigating anywhere — a file can be shared individually
without the caller having any access to its parent folder, so routing through the folder listing
page would 403. This is safe because `GET /files/:id/download-url` only checks permission on the
file itself (`PermissionResolver.resolveRole` finds the explicit `FILE` grant before it would ever
need to consult the containing folder — see "Inheritance algorithm" above).

## Known gaps

- **Trash stays owner-private** — a collaborator can delete a shared item (filed under the real
  owner's Trash, per above) but cannot restore or permanently delete anything from Trash, even
  their own action's result.
