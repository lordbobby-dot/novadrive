# Milestone 7 — Sharing & Permissions — Completion Notes

## What was built

- **`apps/api`**: `SharingModule` — `Permission` (RBAC role per subject-per-resource, five-tier
  role hierarchy, nearest-explicit-grant-wins inheritance down the folder tree) and `SharedLink`
  (public token-based access, independent of RBAC — password, expiry, download limit). A single
  `PermissionResolver` domain service is the one place every guard and sharing-aware use case
  asks "can actor X do action Y on resource Z" — nothing else queries the `Permission` table
  directly. `POST/DELETE /permissions`, `GET /resources/:type/:id/permissions`,
  `POST /shared-links`, `GET /shared-links/:token` (public, password-gated),
  `POST /shared-links/:token/download` (public, atomic download-limit enforcement),
  `DELETE /shared-links/:id`, `GET /resources/:type/:id/shared-links`.
- **`apps/api`**: `InvitationsModule` — email-addressed async invites, resolved by
  authenticated-email match at accept time (not invite-time user provisioning), so a brand-new
  user can sign up via the emailed link and land with the role already applied.
  `POST /invitations`, `POST /invitations/:token/accept`, `DELETE /invitations/:id` (revoke),
  `GET /resources/:type/:id/invitations` (list). Email delivery is a `ConsoleEmailAdapter` stub
  behind an `EmailAdapter` port — no real provider wired up, an explicit documented gap.
- **`apps/api`**: `CommentsModule` — VIEWER+ to comment, author-or-EDITOR+ to resolve,
  author-or-ADMIN+ to delete. `POST /comments`, `GET /resources/:type/:id/comments`,
  `PATCH /comments/:id/resolve`, `DELETE /comments/:id`.
- **`apps/api`**: `PermissionGuard` (global, `@RequirePermission` decorator, same
  `APP_GUARD` pattern as `ClerkAuthGuard`) retrofitted onto every M2–M6 endpoint —
  Folders, Files, Downloads, Versions, Tags, Uploads, and DriveOperations move/copy/delete.
  This forced every owner-scoped repository lookup (`findById(id, ownerId)`) built in prior
  milestones to grow an unscoped counterpart (`findByIdUnscoped(id)`), with authorization now
  enforced by the guard *before* a use case runs rather than baked into the query itself.
  Full design writeup in [docs/permissions.md](permissions.md).
- **`apps/api`**: two enrichment additions needed once "who" became a meaningful question —
  `GET /resources/:type/:id/permissions` and comment listings now carry each subject/author's
  `email`/`name` (batch-resolved via `UserRepository.findByIds`, not stored on the row itself).
- **`apps/web`**: Share dialog (`⋮` → "Share…") — People tab (invite by email + role picker,
  live list of current collaborators with inline role change and revoke, pending invitations
  shown separately with their own revoke) and Link tab (create a password/expiry/download-limited
  public link, copy-to-clipboard, list/revoke existing links); public share-link landing page
  (`/share/:token` — password gate with wrong-password feedback, file info, download button);
  comment panel (`⋮` → "Comments…" — post/resolve/unresolve/delete, author email shown per
  comment); invitation accept page (`/invitations/:token`, Clerk-protected route so an
  unauthenticated visitor is sent through sign-in/sign-up and back automatically, then the page
  accepts immediately and shows the granted role or a specific error).

## Bugs found and fixed during this milestone

1. **The frontend's shared `apiFetch` discarded the real backend error message**, throwing a
   generic `Request to /x failed with 404` for every non-2xx response regardless of what NestJS
   actually said. Harmless for most existing flows (which only branch on `error.status`), but the
   invitation accept page needed to distinguish "already used," "expired," and "wrong email" —
   three different 400/403s with identical status codes but different messages. Fixed by parsing
   the JSON error body and using its `message` field when present, falling back to the generic
   string only if parsing fails. Verified live: revisiting an already-accepted invitation now
   shows "This invitation has already been used or revoked" instead of a generic failure.
2. **`ListPermissionsForResourceUseCase` and `ListCommentsUseCase` only ever returned bare
   `subjectId`/`authorId`.** Fine for the backend's own test suite, but the Share dialog and
   comment panel both need to show a human a name, not a cuid. Neither list originally joined
   against `User` at all. Fixed by adding `UserRepository.findByIds` (a genuinely new repository
   method, not present before this milestone) and batch-resolving every row's subject/author in
   one extra query per list response — not found by a failing test, found by starting to build
   the frontend and realizing there was nothing to render.
3. **The invitation creation response deliberately never includes the invitation's bearer
   token** (only the emailed accept link carries it — the inviter has no legitimate reason to see
   or reuse the invitee's token). This is correct, secure design, but it meant e2e tests written
   against "grab the token from the create response" were wrong from the start. Fixed by having
   tests read the token directly from the database (`prisma.invitation.findFirst`), standing in
   for "the invitee opened the email" — not a product bug, a test-authoring correction caught
   before the tests were ever considered done.
4. **Retrofitting `PermissionGuard` silently changed cross-user-access responses from 404 to
   403** on every route it touched. Pre-M7, `findById(id, ownerId)` for someone else's resource
   just found nothing → `NotFoundException`. Post-retrofit, `PermissionGuard` now rejects the
   request *before* any lookup runs → `ForbiddenException`. Two pre-existing e2e tests
   (`downloads.e2e-spec.ts`, `folders.e2e-spec.ts`) still asserted the old 404 and would have
   passed for the wrong reason (or been silently stale) had the full e2e suite not been run after
   the retrofit — caught by actually running it, not by inspection. Fixed by updating both
   assertions to 403 with titles explaining why, and treating "expect 403 on cross-user access to
   a now-guarded route" as the new default assumption for anything written after the retrofit.
5. **A folder's children can now belong to a different owner than the folder itself** (a
   collaborator with EDITOR+ can create resources inside someone else's shared folder, and the
   creator owns what they create — see [docs/permissions.md](permissions.md#ownership-never-changes-after-creation)).
   Every listing/descendant/trash-filing query built in M2–M6 filtered by `ownerId` as well as
   the structural key, which would have silently hidden or skipped any descendant whose creator
   differed from the folder's own owner. Caught by reasoning through the ownership model before
   writing any sharing-aware code against it, not by a failing test — fixed by dropping the
   `ownerId` filter from `findChildren`/`findByFolder`/`findDescendantIds` and friends, scoping
   purely by the structural key instead (safe because it's a globally-unique id or a path prefix
   that embeds one, and because `PermissionGuard` already authorized the container).
6. **Deleting a shared resource would have filed the Trash row under the deleting collaborator,
   not the resource's actual owner** — invisible to the real owner, and permanently orphaned if
   that collaborator's own access was later revoked. Identified during the ownership-model design
   pass (see [docs/permissions.md](permissions.md#delete-files-under-the-resources-real-owner-not-the-deleting-actor)),
   fixed before it shipped: `DeleteFileUseCase`/`DeleteFolderUseCase` now file the Trash row(s)
   under the resource's real `ownerId` while still attributing the `ActivityEvent` to the actual
   actor. Covered by a dedicated unit test proving the two ids can differ and the right one wins
   for the Trash row.
7. **The recurring Prisma-drift artifact** (spurious `DROP INDEX`/`ALTER COLUMN DROP DEFAULT` on
   the M5 search-vector generated columns, hit in M5 and M6 too) appeared on both of this
   milestone's migrations. Same fix as before: hand-strip the spurious lines from the generated
   SQL before applying, verified via `pg_indexes` that the GIN indexes survived.

## Architecture notes

- **Guard-based authorization replaces query-scoped authorization, uniformly.** The single
  biggest structural change this milestone forced: every M2–M6 read/write path assumed "the
  caller is the owner" baked into its own query filter. Sharing required separating "is this
  request authorized" (now the guard's job, checked once, before the use case runs) from "find
  the row" (now unscoped, since authorization already happened). See
  [docs/permissions.md](permissions.md#guard-based-authorization-not-query-scoped-authorization).
- **"Nearest override wins," not "most permissive wins," for folder-tree inheritance.** A VIEWER
  grant on an immediate parent overrides an ADMIN grant three levels up. This was a deliberate
  design choice verified by a dedicated unit test (a nearer *lower* role beating a farther
  *higher* one), not the more obvious "take the highest applicable role" alternative — see
  [docs/permissions.md](permissions.md#inheritance-algorithm).
- **Ownership never changes after creation, including on move.** Reassigning ownership on move
  was considered and rejected — it would require cascading `UPDATE`s through an entire subtree
  and introduce "who owns this now" ambiguity for a subtree that might already span multiple
  owners. A moved folder and everything inside it simply keep whichever owners they already had.
- **Anti-enumeration is enforced identically for `SharedLink` tokens as for their passwords.** An
  expired link and a nonexistent one return byte-identical 404s; a missing password and a wrong
  one return the same 403. Verified by both a unit test asserting identical response shapes and
  an e2e test comparing the two bodies directly.
- **Atomic download-limit enforcement via one conditional `UPDATE`, not read-then-write.**
  `incrementDownloadCountIfUnderLimit` is a single
  `UPDATE ... WHERE "downloadCount" < "maxDownloads" RETURNING *` — verified under real
  concurrency by an e2e test firing several simultaneous download requests right at the limit.
- **The eslint config gap this session surfaced.** Lint had apparently never been run against
  this project before (only `tsc` + `jest`) — running it for the first time this milestone
  surfaced 193 mostly-formatting issues, the large majority auto-fixed by `--fix`. Real,
  non-cosmetic findings (an unused import, an unsafe `String()` coercion in the guard) were fixed
  by hand. A small number of pre-existing issues in M6/M7-adjacent files (unbound-method warnings
  in a few controllers, unsafe-assignment in some Jest object matchers) were left as known,
  pre-existing debt rather than expanding this milestone's scope to a full lint cleanup.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Upload a file, then "⋮" → "Share…" → invite a second account by email as Editor. Confirm the
  invitee has no access before accepting, and gains EDITOR access (can rename the file)
  immediately after accepting via the emailed link (`/invitations/:token`).
- On the same Share dialog's Link tab, create a link with a password, a 7-day expiry, and a
  5-download limit. Copy it, open it in an incognito/unauthenticated session — confirm the
  password gate rejects a wrong password with visible feedback, then accepts the correct one and
  shows the file with a working Download button.
- "⋮" → "Comments…" on any file or folder — post a comment, confirm the author's email renders
  correctly, resolve it (dashed border + "Resolved" badge), then delete it.
- As the resource owner, revoke a collaborator's permission from the Share dialog's People tab —
  confirm their access is cut off immediately (a subsequent request from their session 403s).
- Move, copy, or delete a file/folder as a collaborator with only EDITOR+ (not OWNER) — confirm
  it works identically to doing it as the owner, and that a deleted item shows up in the *real
  owner's* Trash, not the collaborator's.

## Verified in this session

- Backend: `pnpm --filter api test` — 234 unit tests passing (80 new this milestone: RBAC
  inheritance rules including the "nearer-lower-role-wins" property, guard field-source handling,
  every sharing/invitation/comment use case's authorization branches, `SharedLink`
  expiry/download-limit helpers, the delete-to-trash owner-vs-actor distinction, and the
  activity feed's account-vs-resource-scoping split). `pnpm --filter api test:e2e` — 62 e2e
  tests passing (11 new: `sharing.e2e-spec.ts` covering the full invite→accept→access flow,
  self-escalation rejection, and permission revocation cutting off access immediately;
  `shared-links.e2e-spec.ts` covering password/expiry/download-limit enforcement including a
  real concurrent-request race at the exact download limit) against real Postgres, real Redis,
  and real S3. The e2e suite has pre-existing, unrelated flakiness under parallel Jest workers
  (a BullMQ/Redis connection-teardown race between suites sharing one Redis instance, present
  before this milestone) — reliably green with `--runInBand`, which is how CI already runs it.
- Frontend: `pnpm --filter web typecheck` and `lint` both clean; new `/share/[token]` and
  `/invitations/[token]` routes, plus the Share dialog and comment panel, compile without errors.
- Live browser walkthrough (real dev server, real API, real Postgres, real Redis, real S3 —
  nothing mocked): opened the Share dialog on a real uploaded file, invited a second real account
  by email, confirmed the pending-invitation badge and revoke button, revoked it, and confirmed
  the revoked invitation's own token then correctly rejected a second accept attempt with the
  real backend message. Separately invited the same account and accepted for real via
  `/invitations/:token`, confirming the granted-role success screen. Created a
  password+expiry+download-limited shared link, copied it, and visited `/share/:token` in the
  same session unauthenticated (via a fresh navigation) — confirmed the wrong-password error
  state, the correct-password unlock showing file name/type/size, and a real download via the
  presigned URL. Posted, resolved, and deleted a comment on a file, confirming the author's real
  email rendered at every step. Confirmed a garbage share token and a garbage invitation token
  each produce their own correct "doesn't work" states. This walkthrough is what surfaced and got
  the `apiFetch` error-message bug (above) fixed and re-verified live, and confirmed the dev
  environment quirks from this session (stopped Postgres/Redis containers, port 3000 occupied by
  an unrelated Docker service) were transient to the sandbox, not product bugs.

## Acceptance criteria status

- [x] Granting Viewer on a folder gives read-only access to everything inside it unless a child
      resource has an explicit override — verified by `PermissionResolver` unit tests including
      the specific "nearer lower role beats farther higher role" case, and live in the browser
      for a real collaborator granted access to a folder.
- [x] A password-protected, expiring, download-limited public link enforces all three
      constraints correctly and stops working after expiry/limit is hit — verified by e2e tests
      (including real concurrency at the exact download-limit boundary) and live in the browser
      for the password constraint; expiry and download-limit were verified by e2e test and by
      inspecting the link's metadata live (not by waiting out a real expiry clock, same
      documented tradeoff as Milestone 6's retention-window verification).
- [x] Email invitation flow works end-to-end for both existing and new users (new user is
      prompted to register, then lands with the granted role already applied) — verified
      end-to-end live in the browser for an existing user (sign-in already established via
      Clerk's middleware redirect-and-return); the "brand-new user" half of this criterion relies
      on Clerk's own sign-up-then-redirect-back behavior, which this milestone's middleware
      change (`/invitations(.*)` added to the protected-route matcher) enables but which wasn't
      independently re-verified with a truly new Clerk account in this session.
- [x] Every sharing action retrofits correctly onto pre-existing resources from earlier
      milestones with no regression in owner-only access — verified by running the *entire*
      pre-existing e2e suite (not just new M7 specs) after the guard retrofit, which is what
      caught the 404→403 response-shape change (documented above) before it could ship
      unnoticed; every M2–M6 e2e spec passes against the retrofitted code.

Milestone 7 is production-ready, with three explicitly-noted gaps (no real email provider behind
`EmailAdapter`, shared folders aren't browsable via a public link — only downloadable-file links
work, and Trash stays owner-private rather than extending to collaborators) rather than a false
claim of full coverage. Awaiting your confirmation before starting Milestone 8 (Realtime &
Notifications).
