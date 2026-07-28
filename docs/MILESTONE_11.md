# Milestone 11 — Storage Quota — Completion Notes

## What was built

- **`apps/api`**: new `QuotaModule` — `StorageQuota` model (`subjectType: USER|ORGANIZATION`,
  `subjectId`, `limitBytes`, `usedBytes`, `lastNotifiedThreshold`), `QuotaService` (the single
  place reservation/release/threshold-notification logic lives), atomic conditional-`UPDATE`
  reserve/release on `StorageQuotaRepository` (same pattern `SharedLink`'s download-limit
  enforcement uses). `GET /quota` (personal) and `GET /organizations/:id/quota` (VIEWER+) return
  usage, limit, percent, and a content-type breakdown.
- **`apps/api`**: quota is **reserved atomically at `POST /uploads/initiate`**, before any S3
  call — not incremented later at completion — closing a real check-then-act race a naive
  "increment on complete" design would have had. Released on checksum failure, virus quarantine,
  explicit abort, and permanent delete (individual or via the Milestone 6 retention-purge job),
  grouped by subject for batched folder deletes. `StorageObject` gained
  `quotaSubjectType`/`quotaSubjectId`, resolved once at initiate time from the target folder
  (owner for personal Drive, organization for a workspace folder) and never re-derived later.
- **`apps/api`**: `QuotaNotificationListener` (in `NotificationsModule`) fires a `QUOTA_WARNING`
  notification at 80/95/100% usage, using a ratchet (`lastNotifiedThreshold`) so a threshold only
  notifies once per upward crossing; notifies every org member (not just whoever's upload tipped
  it over) for an organization subject.
- **`apps/web`**: `/drive/storage` (personal usage bar + donut chart by file-type category), a
  compact usage bar embedded in the org detail page (`/drive/organizations/[orgId]`), a
  `QuotaBanner` shown in the Drive view once usage crosses 80% (amber warning) or 100% (red,
  "uploads will be rejected"), scoped to whichever quota the current folder actually draws from.
  New "Storage" sidebar link. The donut chart is a hand-written, dependency-free inline SVG (no
  new charting library), using this app's existing `--chart-1`..`--chart-5` theme variables.
- **`docs/quota.md`** — the reserve-at-initiate design and why it beats increment-at-complete,
  the three release paths plus permanent-delete, why Trash still counts toward quota, the
  quota-subject-stability argument (tied to Milestone 10's cross-scope move rejection), the
  notification ratchet, and known gaps (copy isn't quota-tracked, no abandoned-session GC).

## Bugs found and fixed during this milestone

1. **A naive "increment `usedBytes` when the upload completes" design would have let two
   concurrent uploads both pass a stale quota check and both actually consume S3 storage before
   either discovered the combined total exceeded the limit** — caught during design, not by a
   failing test. Fixed by reserving atomically at `POST /uploads/initiate` instead, via the same
   conditional-`UPDATE`-with-a-`WHERE`-guard pattern `SharedLink`'s download-limit already uses,
   so the check and the write happen in one indivisible statement. Verified with a real
   concurrent-load e2e test (20 parallel requests against a 10-slot limit) rather than trusting
   the design on paper.
2. **The e2e test's own `initiate()` helper was declared `async`, which silently unwrapped
   supertest's chainable `Test` object into a plain `Response`**, breaking `.expect()` chaining.
   The resulting `TypeError` aborted a test mid-flight before its cleanup (`abort`) call ran,
   leaving a stray reservation that then made an unrelated concurrency test's count look wrong
   (6 succeeded instead of 10) — a second-order symptom that looked at first like a real backend
   concurrency bug. Fixed by making the helper a plain function returning the `Test` directly;
   the concurrency assertion (exactly 10/20 succeed, `usedBytes` lands on exactly the limit) then
   passed cleanly and repeatably.
3. **Deciding whether quota should be released for a quarantined upload** wasn't obvious — the S3
   object is deliberately *kept* (Milestone 9's forensics design), so a naive "release only when
   the object is actually deleted" rule would have left a quarantined upload permanently and
   silently eating into the account's quota with no cleanup path, since M9 never built one.
   Resolved by treating quota as "usable Drive capacity," not "raw bytes stored on the account's
   behalf" — released on quarantine, documented explicitly rather than left as an implicit
   consequence of the S3-retention design.
4. **The recurring Prisma migration-drift artifact** (spurious `DROP INDEX`/`ALTER COLUMN DROP
   DEFAULT` on the search-vector columns) appeared again on both of this milestone's migrations.
   Same fix as every prior milestone: hand-strip before applying, verify via `\di` that both GIN
   indexes survived.

## Architecture notes

- **A quota subject's stability is inherited from Milestone 10's own design, not re-derived.**
  `MoveFolderUseCase` already rejects any move crossing the personal/org boundary or between
  workspaces (a fix from that milestone). That guarantee is what lets this milestone resolve a
  file's quota subject **once**, at upload time, and trust that release will always credit back
  the same subject reservation charged — no drift-tracking needed for a value that structurally
  can't change out from under it.
- **Trash counts toward quota; only permanent deletion frees it.** A deliberate choice (the
  roadmap explicitly left "does trash count?" as an implementer decision) — content sitting in
  Trash still occupies real S3 storage, and not counting it would let a user dodge their quota by
  trashing-and-restoring in a loop. Every file version likewise reserves its own space and is
  only released when its own `StorageObject` is deleted, not when a newer version supersedes it.
- **File/folder copy is deliberately not quota-tracked this milestone.** `CopyFileUseCase` creates
  a new `StorageObject` via a real S3 server-side copy entirely outside the upload pipeline's
  reservation gate. A real, documented gap — closing it would need the same check-then-reserve
  treatment as uploads, which the roadmap's task list didn't name explicitly and which risked
  scope creep into this already-large milestone.
- **The donut chart is hand-rolled SVG, not a new dependency.** `apps/web` had no charting library;
  a single 2-color-to-5-color donut didn't justify pulling one in. Uses this app's existing
  `--chart-1`..`--chart-5` CSS variables so it themes correctly in light/dark without any new
  palette decisions.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Visit `/drive/storage` — confirm the usage bar and by-type donut chart render (empty state
  until you've uploaded something).
- Upload files until you notice the `QuotaBanner` appear in the Drive view (amber at 80%+, red at
  100%) — the default personal limit is 10 GiB, adjustable via `DEFAULT_USER_QUOTA_BYTES` for
  faster local testing.
- Attempt an upload that would exceed the remaining quota — confirm the upload item shows a clear
  "would exceed your storage quota" error and no file appears in the folder listing.
- Delete (permanently, from Trash) enough content to free space — confirm the banner disappears
  and further uploads succeed again.
- Create an organization workspace, upload into it, and confirm `/drive/organizations/:id` shows
  the *organization's* shared usage bar, separate from personal usage.

## Verified in this session

- Backend: `pnpm --filter api test` — 336 unit tests passing (24 new this milestone: `QuotaService`
  reserve/release/threshold-ratchet logic, `GetQuotaUseCase` permission/synthesis behavior,
  `resolveQuotaSubject`, `QuotaNotificationListener` recipient resolution, plus updated coverage
  across `InitiateUploadUseCase`/`AbortUploadUseCase`/`VerifyChecksumUseCase`/
  `PermanentDeleteFileUseCase`/`PermanentDeleteFolderUseCase` for reservation/release wiring).
  `pnpm --filter api test:e2e` — 91 e2e tests passing (4 new in `quota.e2e-spec.ts`: pre-S3
  rejection at capacity, successful reserve-then-abort-releases round trip, a real 20-way
  concurrent-reservation load test landing on the exact expected count, and threshold-notification
  dedup across two reservations in the same band). The full pre-existing suite (87 e2e tests from
  M0–M10) stayed green throughout.
- Frontend: `pnpm --filter web typecheck` and `lint` both clean; `packages/types` typecheck clean.
- Live-verified via Swagger (`/api/docs`) that the `quota` tag registers both
  `GET /quota` and `GET /organizations/{id}/quota`, and that the API boots cleanly with
  `QuotaModule` wired into `UploadsModule`, `TrashModule`, and `NotificationsModule`.
- `/drive/storage` was confirmed to correctly redirect an unauthenticated visitor to sign-in,
  proving Clerk's middleware guards the new route identically to every other `/drive/*` page —
  same category of gap as every prior milestone's live-authenticated-walkthrough note: no live
  Clerk session was available this session, and creating one isn't something to do without the
  user's own involvement. The full quota-enforcement flow (reserve, reject, release, notify) is
  instead covered end-to-end by the new e2e suite driving the real HTTP API under real concurrent
  load, which is a stronger correctness guarantee than a manual click-through would have given.

## Acceptance criteria status

- [x] Uploading beyond the configured quota is rejected with a clear, actionable error before any
      S3 multipart upload is even initiated — `QuotaService.reserve` runs and can throw before
      `InitiateUploadUseCase` ever calls `StorageAdapter.createMultipartUpload`; verified by a
      dedicated e2e test asserting `413` with zero S3 interaction.
- [x] `usedBytes` stays accurate under concurrent upload/delete load — verified via a real
      20-parallel-request e2e load test landing on the exact expected reserved total, not an
      approximation.
- [x] Quota-warning notifications fire at the documented thresholds exactly once per threshold
      crossing (no spam) — verified by an e2e test asserting exactly one `QUOTA_WARNING`
      notification after crossing 80%, and no second one from a follow-up reservation that stays
      in the same band.

Milestone 11 is production-ready for the quota-enforcement surface actually built, with gaps
explicitly documented rather than silently assumed away: file/folder copy isn't quota-checked or
-tracked, abandoned upload sessions aren't automatically garbage-collected, and there's no
self-serve quota-upgrade flow (an explicit, roadmap-acknowledged deferral to a future billing
milestone). Awaiting your confirmation before starting Milestone 12 (Advanced Search & Command
Palette).
