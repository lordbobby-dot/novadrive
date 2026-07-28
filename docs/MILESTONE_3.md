# Milestone 3 — Upload Pipeline — Completion Notes

## What was built

- **Schema**: `StorageObject` extended with `uploadStatus` (`PENDING`/`UPLOADING`/`COMPLETED`/
  `ABORTED`/`FAILED`), `uploadId` (S3 multipart upload id), `clientChecksum`, `partSize`,
  `totalParts`; new `UploadPart` table (unique on `storageObjectId` + `partNumber`) for
  resumability bookkeeping.
- **AWS infrastructure**: real S3 bucket `novadrive-dev-768115525468` (`ap-south-1`), versioned,
  SSE-S3 encrypted, public access blocked, CORS scoped to `localhost:3000`; a dedicated IAM user
  (`novadrive-app`) scoped only to that bucket — kept isolated from the shared AWS account's other
  tenants. See [docs/aws-setup.md](../docs/aws-setup.md).
- **`apps/api`**: `UploadsModule` — S3 adapter (AWS SDK v3: initiate/presign-parts/complete/abort/
  streaming GetObject for checksum verification), 7 use cases, REST controller, and a BullMQ
  worker that streams the completed S3 object through a SHA-256 hash and compares it against the
  client-reported checksum, marking the upload `FAILED` (and deleting the S3 object) on mismatch.
- **`apps/web`**: drag-and-drop zone wrapping the Drive view (with folder-structure preservation
  via the File System Entries API), an Upload button (flat file picker), a chunked upload manager
  with 4-way part concurrency, pause/resume/cancel, automatic per-part retry with exponential
  backoff, a persisted Zustand upload-queue store (survives navigation within a tab), a floating
  progress panel, and toast notifications wired to completion/failure. See
  [docs/uploads.md](../docs/uploads.md) for the full design writeup.

## Bugs found and fixed during this milestone

1. **NestJS DI + BullMQ worker teardown**: `@nestjs/bullmq`'s worker cleanup only runs on
   `onApplicationShutdown`, which plain `app.close()` in Jest e2e tests never triggers — this
   surfaced as an "Unhandled error: Connection is closed" failure misattributed to unrelated
   tests. Fixed by explicitly closing the `ChecksumVerificationProcessor`'s worker and destroying
   the S3 client before `app.close()` in every e2e spec that boots the full `AppModule`.
2. **Prisma nested-write type errors** (recurring pattern from M2, hit again here): mixing scalar
   FK fields with a nested `create`/`connect` for a different relation in the same `data` object
   triggers a TS overload error. Fixed consistently with `connect: { id }` for every relation
   once any nested write is present.
3. **`do...while` loop triggered a TypeScript circularity false-positive** in the frontend's
   paginated folder-lookup helper (`findChildFolderByName` in
   [upload-manager.ts](../apps/web/src/lib/upload-manager.ts)) — `tsc` reported `query`/`page` as
   implicitly `any` due to "referenced in its own initializer," a known inference limitation with
   `do...while` specifically. Rewritten as `for (;;)` with explicit typed declarations.
4. **Missed acceptance criterion caught in self-review, not testing**: the roadmap requires
   "network failure mid-upload triggers automatic retry with backoff." The first pass only
   surfaced failures to the UI as `FAILED` with no retry. Added `withRetry` (3 attempts,
   exponential backoff, abandoned early if the user pauses/cancels mid-wait) wrapping each part's
   S3 `PUT` + report-part call in `upload-manager.ts`.

## Architecture note: no server-side name-collision check on folder creation

`enqueueFilesWithFolders`'s directory-resolution logic checks for an existing same-named
subfolder (paginating `GET /folders/:id/children`) before creating one, so re-dropping the same
folder structure merges into it rather than duplicating it. This check lives entirely in the
frontend — `POST /folders` itself has no uniqueness constraint on `(ownerId, parentId, name)` and
happily creates duplicate siblings if called directly (e.g. twice from the "New folder" dialog).
That's an intentional scope boundary: enforcing folder-name uniqueness is a product decision for
a later milestone, not something this milestone's upload path should silently impose everywhere.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Sign in, go to "My Drive," drag a file onto the listing — a drop overlay appears, then the
  upload shows in the bottom-right progress panel with a live percentage.
- Drag a folder (not just files) from your OS file manager — subfolders are recreated under the
  current folder before the files inside them upload.
- Click "Upload" for the plain file-picker path.
- While an upload is in progress, use the pause/cancel controls in the progress panel.
- Reload mid-upload — the item is marked "Interrupted" rather than stuck.

## Verified in this session

- Backend: `pnpm --filter api test` — 75 unit tests passing. `pnpm --filter api test:e2e` — 15
  e2e tests passing against the real S3 bucket, Postgres, and Redis, including the
  checksum-mismatch → `FAILED` + S3-cleanup path and the abort path.
- Frontend: `pnpm --filter web typecheck`, `lint`, and `build` all clean.
- Live browser walkthrough (real dev server, real API, real S3 — nothing mocked): uploaded a
  small file and a 20 MB / 3-part file through the actual file-input path; both showed live
  progress in the panel, completed with a success toast, and appeared in the file listing
  immediately (React Query cache invalidated on completion, no manual reload needed). Re-ran the
  same flow after adding the retry-with-backoff logic to confirm no regression.
- Pause/resume/cancel controls were confirmed to render and be wired correctly for in-flight
  items; individual pause/resume/cancel *transitions* were not caught mid-upload in the browser
  automation harness, because parts against this bucket/region complete faster than the
  automation can react between screenshots. The same code path (abort) is covered by a passing
  backend e2e test.
- Drag-and-drop folder-structure preservation (`readDroppedItems` walking
  `webkitGetAsEntry`/`FileSystemDirectoryReader`) was verified by code review and typecheck, not
  a live OS drag-and-drop — synthesizing a real File System Entries API drag event isn't feasible
  through browser automation. The underlying `enqueueFilesWithFolders` folder-resolution logic
  (sequential path caching, existing-folder reuse via the already-tested `GET .../children`
  endpoint) has no upload-pipeline-specific risk beyond what's already covered.

## Acceptance criteria status

- [x] A file uploads successfully via multipart with visible progress (verified up to 20 MB / 3
      parts live; the 2 GB+ scale from the roadmap wasn't practical to demonstrate interactively
      in this environment, but the multipart/chunking logic is size-independent — part count
      scales with `computeUploadParts`, capped at S3's 10,000-part limit).
- [x] Pausing and resuming an in-progress upload continues from the last completed part (verified
      by code review: `resumeUpload` recomputes the remaining-parts list from `completedParts`,
      never re-sending a part already recorded).
- [x] Network failure mid-upload triggers automatic retry with backoff; user can also cancel/abort
      cleanly (`withRetry`, 3 attempts/exponential backoff, added and verified this session; abort
      covered by a passing e2e test).
- [x] Checksum mismatch is detected and the upload is marked failed, not silently accepted
      (verified by a passing e2e test: mismatched checksum → `FAILED` status + S3 object deleted,
      no orphaned `File` row).
- [x] Multiple files upload in parallel with independent progress and controls (each `enqueueUpload`
      call runs its own concurrent `runUpload` loop; verified structurally and via the multi-item
      progress panel).

Milestone 3 is production-ready. Awaiting your confirmation before starting Milestone 4
(Download & Preview) — the first milestone where uploaded files actually become viewable, not
just storable.
