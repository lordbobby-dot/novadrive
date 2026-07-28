# Trash, Versioning & Activity

Covers the three features built in Milestone 6: recoverable soft-delete (`TrashModule`), file
version history (`VersionsModule`), and an append-only audit log (`ActivityModule`) fed by a
lightweight domain-event dispatcher. See [ROADMAP.md](../ROADMAP.md) for the milestone's full scope.

## Domain events: one generic event, not one class per action

Every use case that does something worth logging — rename, move, copy, delete, restore, upload,
download, version-restore — emits a single event through Nest's `EventEmitter2`:

```ts
this.events.emit(
  ACTIVITY_EVENT,
  new ActivityEvent(ownerId, 'RENAME', 'FILE', fileId, { oldName, newName }),
);
```

`ActivityEvent` (`apps/api/src/common/events/activity.event.ts`) is a plain data class carrying
exactly the fields an `Activity` row needs — `actorId`, `action`, `targetType`, `targetId`,
`metadata`, optional `ipAddress`. `ActivityModule`'s listener (`activity.listener.ts`) is the
*only* code in the app that knows the `Activity` table exists:

```ts
@OnEvent(ACTIVITY_EVENT)
async handleActivity(event: ActivityEvent): Promise<void> {
  try {
    await this.activity.create({ ...event });
  } catch (error) {
    this.logger.error(`Failed to record activity: ${String(error)}`);
  }
}
```

This is a deliberate simplification over "one event class per action" (`FileRenamedEvent`,
`FileMovedEvent`, ...): the Activity table's shape is already generic (an action enum plus
target/metadata), so a dozen near-identical event classes would add ceremony without adding type
safety anywhere that matters — every listener would still just map fields into the same table.

**Fire-and-forget, by design.** `events.emit()` is synchronous dispatch, not awaited by the
caller — a slow or failing activity write must never delay or break the action that triggered it
(a rename should succeed even if the audit log is temporarily unreachable). The listener catches
and logs its own errors rather than letting them become unhandled rejections.

`EventEmitterModule.forRoot()` is wired once in `DomainEventsModule`
(`apps/api/src/infrastructure/events/domain-events.module.ts`) and is `@Global()` by the
package's own default, so `EventEmitter2` is injectable from any module without each one
importing it individually — the same pattern `QueueModule` uses for `BullModule.forRootAsync`.

## Versioning: the current pointer moves, history doesn't

```prisma
model FileVersion {
  id              String   @id @default(cuid())
  fileId          String
  storageObjectId String   @unique
  versionNumber   Int
  createdBy       String
  changeNote      String?
  createdAt       DateTime @default(now())

  @@unique([fileId, versionNumber])
}
```

`File.storageObjectId` is the file's *current* content pointer. Every version — including the
first — gets its own `FileVersion` row pointing at its own `StorageObject`; the `File` row's
`storageObjectId` is rewritten to point at whichever version is current. Restoring an old version
is therefore just:

```ts
await this.files.updateCurrentStorageObject(fileId, ownerId, targetVersion.storageObjectId);
```

No new `FileVersion` row, no deletion of the version being replaced. This is the whole reason
"restoring an old version makes it current without losing the version that was replaced" is
trivial to satisfy: the version that was current before the restore is untouched, since nothing
about it was mutated — only the `File`'s pointer moved. A consequence worth knowing: **the highest
`versionNumber` is not necessarily current** after a restore. The API reflects this explicitly —
`GET /files/:id/versions` returns an `isCurrent` flag per version (computed by comparing each
version's `storageObjectId` against the file's current one), rather than letting the frontend
assume "last row = current."

### Uploading a new version reuses the existing multipart pipeline

There is no separate upload pipeline for versions. `POST /uploads/:id/complete` accepts either
`{ folderId, name }` (new file — unchanged from Milestone 3) or `{ versionOfFileId }` (new version
of an existing file). The checksum-verification worker (`VerifyChecksumUseCase`) branches on which
was sent:

```ts
if (job.versionOfFileId) {
  await this.addFileVersion.execute({ fileId: job.versionOfFileId, ownerId, storageObjectId });
} else {
  const file = await this.files.createFromStorageObject({ ... });
  await this.versions.create({ fileId: file.id, storageObjectId, createdBy: ownerId }); // version 1
}
```

This means every file — including ones created before this migration — has at least one
`FileVersion` row: the migration backfilled version 1 for every pre-existing `File` from its
current `storageObjectId`, and the checksum worker now always creates version 1 for brand-new
files going forward. That invariant matters for permanent-delete (below).

The frontend's "Upload new version" button (in the version-history dialog) reuses the exact same
chunked-upload manager as regular uploads — same retry/resume/progress machinery — just calling
`enqueueVersionUpload(clientId, file, fileId, folderId, getToken)` instead of `enqueueUpload`,
which sets `versionOfFileId` on the tracked upload so the manager sends the right payload at the
complete step.

## Trash: roots only, restore with a sane fallback

A trashed folder's entire subtree gets its own `Trash` row per descendant (unchanged from
Milestone 5's recursive delete). Listing raw `Trash` rows would show one entry per descendant —
deleting a folder with 1000 files would produce 1001 rows in the Trash UI. Instead, `GET /trash`
only returns **root** entries: a trashed folder whose parent isn't also trashed, or a trashed file
whose containing folder isn't also trashed.

```sql
-- folder root: no parent, or parent isn't trashed
SELECT ... FROM "Folder" f JOIN "Trash" t ON t."folderId" = f.id
WHERE f."parentId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Trash" pt WHERE pt."folderId" = f."parentId")

-- file root: containing folder isn't trashed
SELECT ... FROM "File" fi JOIN "Trash" t ON t."fileId" = fi.id
WHERE NOT EXISTS (SELECT 1 FROM "Trash" pt WHERE pt."folderId" = fi."folderId")
```

Restoring a root folder restores its whole subtree together (`folders.restoreSubtree` +
`files.restoreByFolderIds`, mirroring how `softDeleteSubtree`/`softDeleteByFolderIds` trashed them
together in Milestone 5). Same offset-cursor pagination tradeoff as search — see
[docs/search.md](search.md#pagination-offset-not-keyset) — since this is a `UNION` filtered to
"root" rows, not a simple single-table keyset.

**Restore fallback.** If a file's (or folder's) original parent is itself currently trashed —
because it was deleted in a *separate*, later action — restoring relocates to the user's root
instead of resurrecting the item invisibly inside a folder that's on its way to being purged:

```ts
const originalFolderTrashed = await this.folders.isTrashed(file.folderId);
if (originalFolderTrashed) {
  const root = await this.folders.findRoot(ownerId);
  await this.files.move(id, ownerId, root.id);
}
await this.files.restore(id, ownerId);
```

## Permanent delete: cascade direction matters

The schema's cascades run in exactly one direction for storage: deleting a `StorageObject` row
cascades to delete the `File` row that points at it (and, via `File`'s own cascades, its
`FileVersion`/`Trash`/`Tag`/`Favorite` rows) — **not the reverse**. Deleting a `File` row directly
would leave its `StorageObject` (and the S3 object it points at) orphaned forever. So permanent
delete always starts from the storage side:

1. Collect every `StorageObject` id the file's content has ever pointed at — every
   `FileVersion.storageObjectId` for that file, unioned with the file's own current
   `storageObjectId` (belt-and-suspenders: a file created via the legacy stub `POST /files`
   endpoint, used only for M2-era seeding/testing, has no `FileVersion` row at all, so relying on
   `FileVersion` alone would silently leak that file's `StorageObject` forever).
2. Delete each one from S3.
3. `DELETE FROM "StorageObject" WHERE id IN (...)` — cascades away every `File`, `FileVersion`,
   `Trash`, `Tag`, `Favorite` row tied to them.
4. For a folder: `DELETE FROM "Folder" WHERE id = ...` — cascades away every descendant `Folder`
   row (any files inside them are already gone from step 3) and their `Trash`/`Tag`/`Favorite` rows.

`DELETE /trash/:id/permanent` takes the **Trash row's own id**, not the file/folder's id — the
single endpoint resolves which type it marks and dispatches to the matching use case, so the
client doesn't need to know in advance whether a given trash entry is a file or a folder.

## Auto-cleanup: a BullMQ repeatable job, not `@nestjs/schedule`

The retention sweep runs as a BullMQ repeatable job rather than pulling in `@nestjs/schedule` —
this codebase already depends on BullMQ (Milestone 3's checksum-verification queue) and BullMQ's
own `upsertJobScheduler` covers "run this every 24h" without a second scheduling library:

```ts
await this.queue.upsertJobScheduler(
  'trash-cleanup-daily',
  { every: 24 * 60 * 60 * 1000 },
  { name: 'purge-expired-trash' },
);
```

`upsertJobScheduler` (called once in `TrashCleanupScheduler.onModuleInit`) is keyed by a stable
`jobSchedulerId`, so restarting the API doesn't pile up duplicate repeatable jobs the way calling
`queue.add(..., { repeat })` on every boot would. `TRASH_RETENTION_DAYS` (default 30, validated in
`env.validation.ts`) controls the cutoff; the cleanup job purges every expired **root** entry —
purging a root cascades its whole subtree, so descendants never need a separate sweep. One item's
failure (e.g. a transient S3 error) is logged and skipped rather than aborting the rest of the run.

## Frontend

- **Version history dialog** (`components/drive/version-history-dialog.tsx`), opened via a file's
  "⋮" menu → "History…": two tabs, "Versions" (list, current badge, download/restore any version,
  upload a new version) and "Activity" (that file's own activity, reusing the same
  `ActivityFeedList` component the global page uses, filtered by `targetId`).
- **Trash page** (`/drive/trash`): restore/permanently-delete per item, "Empty Trash", and a
  days-remaining indicator computed client-side from `deletedAt` against the known 30-day default
  (the exact server-side retention window isn't exposed over the API — the indicator is
  informational, not authoritative).
- **Global activity page** (`/drive/activity`): the same `ActivityFeedList`, filterable by action.
