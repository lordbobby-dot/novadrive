# Milestone 2 — Core Drive Data Model — Completion Notes

## What was built

- **Schema**: `Folder` (materialized path, partial-unique root-per-owner index), `StorageObject`
  (S3 pointer/metadata, no binary data), `File` (1:1 with `StorageObject`), `Trash`/`Favorite`
  (marker tables with `CHECK` constraints, schema only — no endpoints yet, that's M6/M7). See
  [docs/data-model.md](../docs/data-model.md) for the full design writeup and ERD.
- **`apps/api`**: `FoldersModule` (root lazy-create, create/rename/list-children/breadcrumb,
  cursor pagination) and `FilesModule` (create-with-stub-StorageObject/rename/get/list-by-folder),
  both in clean-architecture layers, both scoped to the authenticated owner (404, not 403, on
  cross-owner access).
- **`apps/web`**: `/drive` (redirects to root) and `/drive/[folderId]` — sidebar, breadcrumbs,
  grid/list toggle (Zustand + localStorage persistence), New Folder dialog (React Hook Form +
  zod), inline rename via a per-item dropdown menu, loading skeletons, empty state.
- **`packages/types`**: shared `FolderResponse`/`FileResponse`/`CursorPage<T>` wire types used by
  both the frontend hooks and (structurally) the API's DTOs.
- **Seed script**: demo user + sample folder tree by default; `SEED_BULK=true` generates 10,000
  synthetic files in a dedicated folder for pagination-performance testing.

## Bugs found and fixed during browser verification

Both found by actually clicking through the UI, not by code review — exactly the kind of thing
that stays invisible until you drive the feature:

1. **New Folder dialog didn't reset on reopen.** `form.reset()` only ran on successful submit;
   closing the dialog without submitting (backdrop click, Escape) left the draft name in place,
   so reopening and typing again appended to stale text. Fixed by resetting in `onOpenChange`
   whenever the dialog transitions to open, not just on success
   ([new-folder-dialog.tsx](../apps/web/src/components/drive/new-folder-dialog.tsx)).
2. **Clicking a folder card's "⋮" menu also navigated into the folder.** The dropdown trigger
   was nested inside the folder's `<Link>` without stopping event propagation, so opening the
   menu (or clicking an item in it) bubbled up and triggered navigation. Fixed by wrapping the
   menu in a container that calls `preventDefault`/`stopPropagation`
   ([drive-item-card.tsx](../apps/web/src/components/drive/drive-item-card.tsx)).

Both are covered going forward by the fact that the fix is now what a fresh `pnpm dev` serves —
worth a regression check in Milestone 5 when move/copy context-menu actions get added to the same
component.

## Architecture note: global auth guard

While wiring `FoldersController`/`FilesController`, per-controller `@UseGuards(ClerkAuthGuard)`
(the M1 pattern) started failing NestJS's DI resolution intermittently depending on module
registration order — a real fragility in relying on `@Global()` module exports being resolvable
from `@UseGuards(SomeClass)` on unrelated modules. Fixed by switching to the standard NestJS
pattern for this exact situation: `ClerkAuthGuard` is now registered once as `APP_GUARD` (applies
to every route by default), with a `@Public()` decorator (`common/decorators/public.decorator.ts`)
opting out `HealthController` and `ClerkWebhookController`. This is more robust and scales
correctly as more protected modules get added in later milestones — no more remembering to
annotate every new controller.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Sign in, go to "My Drive" → lands on your root folder.
- Create nested folders several levels deep, navigate via breadcrumbs (both forward via folder
  clicks and backward via breadcrumb links).
- Toggle grid/list view, reload the page — the choice persists.
- Rename a folder via its "⋮" menu.
- `SEED_BULK=true pnpm --filter api exec prisma db seed` generates 10k files in a "Stress Test"
  folder for a pagination-performance check.

## Verified in this session

- 40 unit tests + 10 e2e tests (including a real-Postgres integration suite covering nested
  creation, breadcrumb ordering, cursor pagination with no page overlap, cross-owner 404s, and
  file creation/listing/rename) — all passing.
- `EXPLAIN ANALYZE` on a cursor-paginated file listing against 10,000 seeded rows: ~3ms execution
  time.
- Full live browser walkthrough: signed in, created a 3-level-deep folder tree
  (Photos → 2026), confirmed breadcrumb navigation both directions, confirmed grid/list
  persistence across reload, found and fixed the two bugs above live.
- Clean lint/typecheck/build across the whole monorepo after the fixes.

## Acceptance criteria status

- [x] User can create arbitrarily deep nested folders and navigate via breadcrumbs (verified 3
      levels deep in-browser; the materialized-path design has no depth limit).
- [x] Folder/file listing is cursor-paginated and performs well with 10k+ synthetic rows (~3ms
      query execution time, seed script provided).
- [x] Grid/list view toggle persists per user (Zustand + localStorage, verified across reload).
- [x] No binary data anywhere in Postgres — `StorageObject` rows are metadata-only stubs,
      verified directly via `psql` in the e2e test.

Milestone 2 is production-ready. Awaiting your confirmation before starting Milestone 3 (Upload
Pipeline) — the first milestone where `StorageObject` rows become real S3 objects instead of
stubs.
