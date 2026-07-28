# Milestone 6 — Trash, Versioning & Activity — Completion Notes

## What was built

- **`apps/api`**: a lightweight domain-event dispatcher (`@nestjs/event-emitter`, wired once via
  `DomainEventsModule`) — every rename/move/copy/delete/download/upload/restore use case across
  the app now emits a single generic `ActivityEvent` rather than writing activity rows itself.
- **`apps/api`**: `ActivityModule` — an append-only `Activity` table, a listener that's the only
  code aware the table exists, and `GET /activity` filterable by `targetId`/`targetType`/`action`/
  date range with cursor pagination.
- **`apps/api`**: `VersionsModule` — `FileVersion` table (immutable history; `File.storageObjectId`
  is the movable "current" pointer), `GET /files/:id/versions` (with an `isCurrent` flag per
  version), `POST /files/:id/versions/:v/restore`, `GET /files/:id/versions/:v/download-url`.
  Uploading a new version reuses the existing multipart pipeline unchanged — `POST
  /uploads/:id/complete` now accepts `{ versionOfFileId }` as an alternative to `{ folderId, name
  }`, branching inside the checksum-verification worker.
- **`apps/api`**: `TrashModule` — `GET /trash` (root entries only — a trashed folder counts once,
  not once per descendant), `POST /files/:id/restore` + `POST /folders/:id/restore` (with a
  fallback-to-root relocation if the original location was also deleted), `DELETE
  /trash/:id/permanent` (real S3 + Postgres cleanup, cascade-aware), and a BullMQ repeatable
  cleanup job purging expired root entries daily. Full design writeup in
  [docs/versioning-and-activity.md](versioning-and-activity.md).
- **`apps/web`**: a version-history dialog (per-file "⋮" → "History…") with Versions and Activity
  tabs, reusing the chunked upload manager for "upload a new version"; a Trash page (restore,
  permanent-delete, empty-trash, days-remaining indicator); a global Activity page filterable by
  action; both sidebar links (previously placeholders) now go live.

## Bugs found and fixed during this milestone

1. **A stub-created file (via the legacy `POST /files` endpoint, no real upload) has no
   `FileVersion` row.** Since permanent-delete originally collected S3 objects to clean up solely
   via `FileVersionRepository.listStorageObjectIdsForFiles()`, such a file's `StorageObject` would
   never be found — permanent-delete would silently leave the File/StorageObject rows completely
   untouched instead of deleting them. Found by reasoning through the cascade chain before writing
   tests, not by a failing test. Fixed by unioning the FileVersion-derived ids with each file's own
   current `storageObjectId` before deciding what to delete.
2. **The shared frontend `apiFetch` always called `response.json()`, including on `204 No
   Content` responses.** A 204 has no body, so `.json()` throws on the empty string — every DELETE
   endpoint returning 204 (file soft-delete, and this milestone's permanent-delete) would have its
   mutation *reported* as failed in the UI even though the server had already applied the change
   correctly. Found live in the browser: `DELETE /trash/:id/permanent` returned 204 in the network
   log, the row was gone from a subsequent fetch, yet the UI showed "Couldn't delete X" — a
   pre-existing bug (present since file soft-delete shipped in Milestone 5), not something this
   milestone introduced, but this milestone's browser walkthrough is what surfaced it. Fixed by
   special-casing 204 in `apiFetch` to return `undefined` instead of attempting to parse a body —
   matching a special-case the upload manager's own separate fetch helper already had.
3. **Prisma's drift detection tried to `DROP INDEX` on the Milestone 5 search GIN indexes again**,
   the same `Unsupported("tsvector")` confusion hit in Milestone 5's own migration. Caught before
   applying by inspecting the generated migration SQL (now a standard step for any migration in
   this project, per the Milestone 5 postmortem) and stripping the four spurious `DROP INDEX` /
   `ALTER COLUMN ... DROP DEFAULT` lines before running it.

## Architecture notes

- **One generic `ActivityEvent`, not one class per action.** The Activity table's shape is already
  generic (action enum + target + metadata); a dozen near-identical event classes would add
  ceremony without adding type safety anywhere it matters. See
  [docs/versioning-and-activity.md](versioning-and-activity.md#domain-events-one-generic-event-not-one-class-per-action).
- **Versioning's "current pointer moves, history doesn't."** Restoring an old version is a single
  `UPDATE` (rewrite `File.storageObjectId`) — no new version created, nothing deleted. This is
  what makes "restore v1, don't lose v3" trivial rather than requiring diff/merge logic.
- **Trash lists roots only.** A recursively-deleted 1000-file folder produces 1001 `Trash` rows in
  the database but exactly one entry in the Trash UI — computed via a "parent isn't also trashed"
  filter, reused identically by the cleanup job's expiry sweep so "what's shown" and "what gets
  purged" can never disagree.
- **Cascade direction drove the permanent-delete algorithm.** Deleting a `StorageObject` cascades
  to delete its `File`; the reverse isn't true. Permanent delete therefore always starts from
  collecting `StorageObject` ids, not from the `File`/`Folder` rows.
- **BullMQ's own `upsertJobScheduler`, not `@nestjs/schedule`**, for the daily cleanup job — one
  less dependency, and idempotent-by-key so restarts don't create duplicate repeatable jobs.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Rename, move, delete, download, or upload a file — then open `/drive/activity` and confirm the
  action appears with the correct actor-relative description ("Renamed...", "Deleted...", etc).
- Open a file's "⋮" menu → "History…" — the Versions tab shows version 1 marked "Current"; upload
  a new version and confirm a second row appears and the first is no longer marked current.
  Restore version 1 and confirm it becomes current again *without* the second version
  disappearing from the list. The file's own Activity tab (same dialog) shows the upload/restore
  events scoped to just that file.
- Delete a file or a folder with nested contents — it appears in `/drive/trash` as a single entry
  regardless of how many descendants it had. Restore it (back to its original location), or
  permanently delete it (gone for good — confirm it no longer appears anywhere, including a direct
  API check that the row is gone).
- Delete a file whose folder is *also* later deleted, then restore the file from Trash — confirm
  it lands in your Drive root rather than failing or resurrecting invisibly.

## Verified in this session

- Backend: `pnpm --filter api test` — 130 unit tests passing (27 new: retention-window
  calculation, restore/permanent-delete fallback and cascade logic for both files and folders,
  version add/restore, the purge sweep's per-item failure isolation, and the activity listener's
  event-to-row mapping and error-swallowing). `pnpm --filter api test:e2e` — 51 e2e tests passing
  (14 new across `trash.e2e-spec.ts`, `versions.e2e-spec.ts`, `activity.e2e-spec.ts`), including
  the roadmap's explicit scenario — upload a file, upload a second version, see two versions,
  restore the first, confirm current content matches the restored bytes exactly, and confirm the
  second version's bytes are still independently downloadable — against real Postgres and real S3.
- Frontend: `pnpm --filter web typecheck`, `lint`, and `build` all clean; new `/drive/trash` and
  `/drive/activity` routes appear in the build output.
- Live browser walkthrough (real dev server, real API, real Postgres, real S3 — nothing mocked):
  opened the version-history dialog and confirmed the Versions tab showed a real uploaded file's
  version 1 marked "Current" with correct size and relative timestamp; switched to the Activity
  tab and confirmed "No activity yet" for a file that predates this milestone (correct — activity
  tracking only started with this migration); deleted a file and confirmed it appeared in
  `/drive/trash` with a "30 days left" indicator; restored it and confirmed Trash returned to
  empty and the file reappeared in My Drive (verified via the real `POST /files/:id/restore` →
  `201` in the network log); deleted it again and permanently deleted it via `/drive/trash`,
  confirming a real `DELETE /trash/:id/permanent` → `204` and the item never reappearing; visited
  `/drive/activity` and confirmed every action performed during the walkthrough
  (Deleted/Restored/Deleted) showed up in order with correct relative timestamps. This walkthrough
  is what surfaced and got the `apiFetch` 204-handling bug (above) fixed and re-verified live.

## Acceptance criteria status

- [x] Deleted items appear in Trash and are restorable to their original location (or a sane
      fallback if the original folder was also deleted) — verified by e2e tests covering both the
      normal-restore and fallback-to-root paths, and live in the browser for the normal path.
- [x] Items older than the retention window are auto-purged by the scheduled job — verified by
      unit tests on the purge use case (dispatch-per-type, per-item failure isolation) and by
      confirming the BullMQ repeatable job registers and runs on boot (`TrashCleanupProcessor`
      logged `purged 0, failed 0` immediately after the app started, before any items had expired).
      Not verified against a live, real 24-hour clock — a short `TRASH_RETENTION_DAYS` override
      plus the existing `findExpiredRoots`/purge unit and e2e coverage stands in for that.
- [x] Uploading a new version of a file preserves the old one; restoring an old version makes it
      current without losing the version that was replaced — verified end-to-end by e2e test
      against real S3 (exact byte comparison before and after restore) and confirmed live in the
      browser.
- [x] Every major action (upload/download/delete/rename/move/share/login/logout/permission-change/
      version-restore) shows up in the activity feed with correct actor and timestamp — verified
      for upload/download/delete/rename/move/copy/restore/version-restore, both via e2e tests and
      live in the browser. **Not implemented**: login/logout, permission-change, and share. Login/
      logout have no natural hook to emit from yet — this app has no explicit
      session-start/session-end endpoint (Clerk manages sessions client-side; only
      `user.created`/`updated`/`deleted` flow through a webhook). Permission-change and share
      don't exist as concepts until Milestone 7 (Sharing & Permissions). Wiring these in is
      appropriately scoped to when those mechanisms themselves get built, not invented early as a
      hollow event with nothing real behind it.

Milestone 6 is production-ready, with two explicitly-noted gaps (real-clock retention-purge
verification, and login/logout/permission-change/share activity events with no mechanism yet to
hook them to) rather than a false claim of full coverage. Awaiting your confirmation before
starting Milestone 7 (Sharing & Permissions).
