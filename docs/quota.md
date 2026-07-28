# Storage Quota

A quota is tracked per **subject** — either a single `User` (personal Drive) or an
`Organization` (shared across every workspace inside it), never a `Workspace` individually.
`StorageQuota` (`subjectType`, `subjectId`, `limitBytes`, `usedBytes`, `lastNotifiedThreshold`)
is lazily created with a config-driven default limit (`DEFAULT_USER_QUOTA_BYTES` /
`DEFAULT_ORG_QUOTA_BYTES`) on first upload attempt — quotas are never provisioned eagerly for
every user/org.

## Reserve-at-initiate, not increment-at-complete

The obvious design — increment `usedBytes` once a file finishes uploading — has a race: two
concurrent `POST /uploads/initiate` calls could both pass a "do I have room?" check against the
same stale `usedBytes`, both proceed to create real S3 multipart uploads, and only discover the
combined total exceeds the limit after real storage was already consumed. Instead, NovaDrive
**reserves space atomically at initiate time**:

1. `InitiateUploadUseCase` resolves the quota subject from the target folder (see below), then
   calls `QuotaService.reserve(subject, size)` **before** calling
   `StorageAdapter.createMultipartUpload` — a `QuotaExceededException` (413) here means no S3
   call was ever made, satisfying the acceptance criterion literally.
2. `reserve` is a single conditional `UPDATE`, not a read-then-write:
   ```sql
   UPDATE "StorageQuota"
   SET "usedBytes" = "usedBytes" + $delta
   WHERE "subjectType" = $type AND "subjectId" = $id
     AND "usedBytes" + $delta <= "limitBytes"
   RETURNING *
   ```
   The same pattern `SharedLink`'s atomic download-limit enforcement uses (see
   `docs/permissions.md`) — two concurrent reservations racing for the last available bytes can't
   both succeed. Verified under real concurrent load in `test/quota.e2e-spec.ts`: 20 parallel
   1000-byte requests against a 10,000-byte limit produce exactly 10 successes and 10 `413`s,
   with `usedBytes` landing on exactly `10000`, not more and not less.
3. The reservation **is** the accounted usage — `VerifyChecksumUseCase`'s success paths (new file,
   new version) do **not** increment anything further; the number was already correct the moment
   `reserve` returned.

## Release: three failure paths, plus permanent delete

A reservation that never becomes real, permanent usage must be released:

- **Checksum mismatch** (`VerifyChecksumUseCase`) — the object is deleted from S3 and the
  reservation is released.
- **Virus quarantine** (`VerifyChecksumUseCase`) — released even though the S3 object itself is
  *kept* (not deleted, per Milestone 9's forensics design). Quota reflects usable Drive capacity,
  not raw bytes NovaDrive happens to be storing on the account's behalf; a quarantined upload was
  never something the account could access, so it shouldn't count against them.
- **Explicit abort** (`AbortUploadUseCase`) — released only for a session still in `PENDING` or
  `UPLOADING` status, guarding against double-releasing an already-terminal session's already-
  resolved reservation.
- **Permanent delete** (`PermanentDeleteFileUseCase` / `PermanentDeleteFolderUseCase` /
  `PurgeExpiredTrashUseCase`) — every `StorageObject` actually deleted (current version and every
  historical one) releases its own reserved bytes, grouped by subject via
  `QuotaService.releaseMany` so a folder with 1,000 files issues one release call per distinct
  subject, not one per file.

`release` is also a single atomic `UPDATE` (`GREATEST(usedBytes - delta, 0)`), never rejected.

## Trash counts toward quota; only permanent deletion frees it

Soft-deleting a file or folder (moving it to Trash) does **not** release its reservation — the
content still exists in S3 and still occupies real storage, so it still counts. Only permanent
deletion (explicit, or via the scheduled retention-purge job from Milestone 6) releases the
space. Restoring from Trash needs no quota change either way, since the reservation was never
touched by the soft-delete in the first place. Every new **version** of a file (Milestone 6) also
reserves its own space at upload time and is only released when its `StorageObject` is actually
deleted — old versions are never silently freed just because a newer one exists.

## Resolving which subject a file counts against

`resolveQuotaSubject(folder)` is a pure function: a folder with `organizationId` set charges the
organization; otherwise it charges `folder.ownerId`. This is resolved **once**, at
`InitiateUploadUseCase` time, and stamped directly onto the `StorageObject` row
(`quotaSubjectType`/`quotaSubjectId`) — never re-derived later from wherever the content
currently lives. This matters because a folder's scope can't drift after creation for a subtler
reason than convenience: `MoveFolderUseCase` (Milestone 10) already rejects any move that would
cross the personal/org boundary or move between workspaces, so a file's charged subject is stable
for its entire life — release always credits back the exact same subject that reservation
originally charged, with no possibility of drift even under concurrent moves.

## Threshold notifications: a ratchet, not a level check

`QuotaService` fires a `QuotaThresholdEvent` (80/95/100, highest-crossed-only — a single upload
that jumps straight from 10% to 97% fires only the 95% notification, not 80% too) exactly once
per **upward crossing**, using `StorageQuota.lastNotifiedThreshold` as a ratchet:

- A reservation only notifies if the new percentage crosses a threshold *higher* than the last one
  notified.
- A release resets the ratchet to 0 once usage drops back **below the lowest threshold (80%)** —
  so a subject that dips under 80% and climbs back over it later gets notified again, but merely
  hovering in the 80-94% band after an 80% notification doesn't re-fire on every subsequent small
  upload.

`QuotaNotificationListener` (in `NotificationsModule`, not `QuotaModule` — the same "one listener
owns the table" separation `NotificationEventListener` already established) resolves recipients:
a `USER` subject notifies just themself; an `ORGANIZATION` subject notifies the owner **and**
every explicit member, since a shared pool crossing a threshold is everyone's problem, not just
whoever's upload tipped it over.

## Reported usage, and what isn't tracked

`GET /quota` (personal) and `GET /organizations/:id/quota` (VIEWER+) return `usedBytes`,
`limitBytes`, `percentUsed`, and a breakdown by content-type category (grouped client-side into
Images/Videos/Audio/Documents/Other for the donut chart). The breakdown query includes every
`StorageObject` whose reservation is still live (`PENDING`/`UPLOADING`/`COMPLETED` — i.e.
everything not yet released), matching exactly what contributes to `usedBytes`.

**File/folder copy is quota-tracked**, the same as uploads. `CopyFileUseCase.copy` — the single
method both single-file copy and `CopyFolderUseCase`'s recursive per-file deep-copy funnel
through — resolves the *target* folder's quota subject (`resolveQuotaSubject`, org-scoped folder
vs. personal) and calls `QuotaService.reserve` for the source file's size before ever issuing the
S3 server-side copy, mirroring `InitiateUploadUseCase`'s check-then-reserve order exactly: a
`QuotaExceededException` (413) means no S3 call was made. The resulting `StorageObject` is stamped
with that same `quotaSubjectType`/`quotaSubjectId`, so it participates in `releaseMany` like any
other object when it's later permanently deleted — copies were previously invisible to quota
entirely (neither reserved on creation nor released on deletion), which both let a single file be
copied without bound to consume unlimited real storage, and meant `usedBytes` never reflected
what copies actually occupied.

## Abandoned-upload cleanup

A reservation from an upload session that never completes, aborts, or otherwise resolves — a
closed tab, a dropped connection — used to sit reserved forever. `AbandonedUploadCleanupScheduler`
(`uploads/infrastructure/`) registers an hourly repeatable BullMQ job (`upsertJobScheduler`, same
idempotent-on-restart pattern `TrashCleanupScheduler` uses) that runs `PurgeAbandonedUploadsUseCase`:
find every `StorageObject` still `PENDING`/`UPLOADING` after `ABANDONED_UPLOAD_STALE_HOURS`
(default 24h, via the new `StorageObject(uploadStatus, createdAt)` index) and abort each one
through `AbortUploadUseCase.execute(session.id, session.ownerId)` — reused rather than
duplicated, since an abandoned session is exactly a client-initiated cancel the client never got
to issue: same S3 multipart abort, same `QuotaService.release`, same `markAborted`, same
realtime `UPLOAD_ABORTED` emit in case the tab reconnects. One session's failure (e.g. a
transient S3 error) is logged and skipped rather than aborting the rest of the sweep.

## Known gaps

- **A reservation could theoretically leak if `StorageAdapter.createMultipartUpload` itself fails
  after `QuotaService.reserve` already succeeded** — a narrow, transient-S3-error window with no
  automatic rollback in this milestone.
- **No self-serve quota upgrade flow** — a billing/self-checkout path is out of scope until a
  future milestone, per the roadmap's own note. Raising a *user's* limit is now an admin-panel
  action (see below), not only a direct DB write — organizations still require one, though.

## Admin overrides

An admin can set an exact `limitBytes` for a specific user via `PATCH /admin/users/:id/quota`
(`{ limitBytes: "5000000000" }`, bytes as a decimal string — see
[`docs/admin.md`](admin.md#overriding-a-users-storage-quota) for the full endpoint writeup).
`StorageQuotaRepository.setLimit` backs this: an upsert that creates the subject's row (usedBytes
starting at 0) if they've never uploaded, or updates just `limitBytes` on an existing row —
distinct from `getOrCreate` (used by the real reservation path below), which only ever applies the
*default* limit and no-ops if a row already exists. An override takes effect immediately; the very
next `QuotaService.reserve` call reads the new `limitBytes` off the row, no cache to invalidate.
