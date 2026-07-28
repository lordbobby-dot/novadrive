# Search

NovaDrive's search is a dedicated read-model query service (`SearchModule`) sitting behind a
`SearchService` interface, backed today by Postgres full-text search (FTS). It is intentionally
isolated from `FoldersModule`/`FilesModule` — `SearchModule` talks to Postgres directly rather than
importing those modules — so the implementation can be swapped for a dedicated search engine (e.g.
OpenSearch) later without touching the controller, DTOs, or the frontend.

## Data model

`File.searchVector` and `Folder.searchVector` are Postgres **generated columns**
(`GENERATED ALWAYS AS (...) STORED`), each backed by a GIN index:

```sql
ALTER TABLE "File" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', regexp_replace("name", '[._-]+', ' ', 'g'))) STORED;
CREATE INDEX "File_searchVector_idx" ON "File" USING GIN ("searchVector");
```

(Folder has the identical pair.) Postgres recomputes the column automatically on every insert/update
to `name` — there's no application-level sync code, and no risk of the index drifting from the row.

**Why `regexp_replace` before `to_tsvector`:** Postgres's default text-search parser treats a
filename like `sample.json` as a single compound "file" token, not two words — so a plain search for
`sample` wouldn't match it. Replacing `.`, `_`, and `-` with spaces before tokenizing splits
`sample.json` → `sample json`, `my-report_final.pdf` → `my report final.pdf`, so a search for any of
those words matches.

Prisma has no way to express a generated column, so the migration's `ALTER TABLE` was hand-written
(not Prisma-generated) and the field is declared in `schema.prisma` as
`searchVector Unsupported("tsvector")?` — just enough for Prisma's drift detection to know the
column exists and leave it alone, without Prisma ever trying to write to it.

`Tag` / `FileTag` / `FolderTag` are ordinary tables (`Tag` unique per `(ownerId, name)`; the join
tables are composite-PK many-to-many), unrelated to the generated columns.

## Query shape

`PostgresSearchService.search()` builds one `SELECT` per requested type (file, folder, or both),
`UNION ALL`s them, and ranks the combined result:

```sql
SELECT 'file' AS type, f.id, f.name, f."folderId" AS "parentOrFolderId",
       so."contentType", so.size::text AS size, f."createdAt", f."updatedAt",
       ts_rank(f."searchVector", plainto_tsquery('english', $q), 1) AS rank
FROM "File" f
JOIN "StorageObject" so ON so.id = f."storageObjectId"
WHERE f."ownerId" = $ownerId
  AND f."searchVector" @@ plainto_tsquery('english', $q)
  AND NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."fileId" = f.id)
  -- + optional date-range / tag conditions

UNION ALL

SELECT 'folder' AS type, ... FROM "Folder" fo WHERE ...

ORDER BY rank DESC, "createdAt" DESC
LIMIT $limit + 1 OFFSET $offset
```

Notable choices:

- **`plainto_tsquery`, not `to_tsquery`.** `to_tsquery` expects tsquery operator syntax (`&`, `|`,
  `!`) and throws on arbitrary input; `plainto_tsquery` tolerates whatever a user types into a
  search box.
- **`ts_rank(..., ..., 1)` — normalized rank.** The third argument divides the rank by document
  length, so a filename that mentions the search term once in a short name ranks above one that
  mentions it once buried in a long name. Without normalization, both score identically and the
  tie-break (`createdAt DESC`) would put whichever file was uploaded more recently first,
  regardless of relevance.
- **Trash exclusion via `NOT EXISTS`.** Trash is a marker-table soft delete (see
  [docs/data-model.md](data-model.md)), not a `deletedAt` column, so every search branch filters
  rows that have a matching `Trash` entry.
- **Tag filter via `EXISTS` against the join table**, scoped to `tg."ownerId"` so one user's tag
  named `"draft"` never matches another user's file tagged with a different tag also named
  `"draft"`.
- **`LIMIT + 1` lookahead** determines `hasMore` without a second `COUNT` query — read one extra
  row, and if it came back, there's a next page.

## Pagination: offset, not keyset

The rest of the app (folder children, file listings) uses keyset/cursor pagination on `id`,
because `id` is a stable, monotonic sort key — the row at a given cursor never moves. Search results
are ordered by `rank`, which is **not** stable: it depends on the query string and can tie across
many rows. A keyset cursor built from `(rank, id)` would work in principle, but re-deriving `rank`
purely from the cursor value (without re-running `ts_rank`) isn't possible, and using `id` as a
tie-breaker for stability would silently override the relevance ordering the ranking exists to
produce in the first place.

So search's cursor is simply the next `OFFSET`, encoded as a string. This is a deliberate tradeoff,
not an oversight: offset pagination can skip or repeat a row if the underlying data changes between
pages (same as any offset-paginated API), but for a search-results UI where a user is scrolling
through ranked matches, that's an acceptable cost against the alternative of losing accurate
relevance ordering.

## Filters

`GET /search?q=&type=&owner=&dateFrom=&dateTo=&tag=&workspaceId=&folderId=&cursor=&limit=`

- `q` — required, passed through `plainto_tsquery`.
- `type` — `file` | `folder`, omit for both.
- `dateFrom` / `dateTo` — inclusive bounds on `createdAt`.
- `tag` — exact tag name, scoped to the requesting owner's tags (still true even inside a
  workspace search — tags remain personal, never shared).
- `workspaceId` — **(Milestone 12)** switches the base scope from the caller's personal Drive to
  this workspace's shared content (every file/folder in it, regardless of who created it). Caller
  must be a VIEWER+ member of the workspace's organization, checked via `OrgRoleResolver` in
  `SearchUseCase` before the query ever reaches Postgres — the only new dependency `SearchModule`
  has ever taken on (`OrganizationsModule`, for `WORKSPACE_REPOSITORY` + `OrgRoleResolver`).
  A `workspaceId` that doesn't resolve to a real workspace rejects with the identical
  `ForbiddenException` a real-but-inaccessible workspace would — never distinguishing "doesn't
  exist" from "you can't see it," the same anti-enumeration property `PermissionResolver` already
  holds for files/folders (see [docs/sharing.md](sharing.md) if present, or M7's design notes).
- `owner` — **(Milestone 12)** restricts to one specific user's uploads. A no-op in personal
  search (there's only ever one owner: yourself); genuinely useful inside a workspace search where
  multiple members' uploads coexist.
- `folderId` — **(Milestone 12)** restricts to this folder's subtree (the folder itself and every
  descendant, at any depth), via the same materialized-path-prefix technique
  `FolderRepository.findDescendantIds` uses — computed as an inline SQL scalar subquery rather than
  a call into `FoldersModule`, preserving the "talks to Postgres directly" architecture.
- `cursor` / `limit` — offset pagination as described above (default `limit` 20).

Every query is additionally scoped to `ownerId` from the authenticated request (or to
`workspaceId` when set) — there is no cross-user search within personal Drive, and no
cross-organization search at all.

## Recent and Favorites (Milestone 12)

Two read-model listings share `SearchService`'s query/pagination shape but aren't full-text
searches — they're pulled out into their own routes rather than parameters on `/search` because
neither takes a `q`:

- **`GET /recent?workspaceId=&cursor=&limit=`** — files only (folders have no "opened" concept),
  ordered by `File.lastAccessedAt DESC`. That column is set only when a download or preview
  signed URL is actually issued (`GetDownloadUrlUseCase` / `GetPreviewUrlUseCase`), never on a
  mere metadata fetch (`GetFileUseCase`) — so Recent reflects genuine content access, not upload
  history. A file nobody has opened since uploading it never appears. Supports the same
  `workspaceId` VIEWER+ authorization (and the same anti-enumeration guarantee) as `/search`, via
  `ListRecentUseCase`.
- **`GET /favorites?cursor=&limit=`** — files and folders the caller has favorited, ordered by
  `Favorite.createdAt DESC`. Always personal (no workspace mode) — see below.

Both reuse `PostgresSearchService`'s `toPage`/`toDomain` helpers and the same
`SearchResultPage`/`SearchResultItem` response shape as `/search`, so the frontend's `ResultList`
component (row rendering, "jump to item" navigation, favorite-star affordance) is shared across
all three pages.

## Favorites is a real feature, not just exposure (a roadmap scope correction)

The roadmap's original wording implied `GET /favorites` merely "exposes" a pre-existing Milestone 2
feature. It doesn't exist: a full grep across the codebase before this milestone found only the
`Favorite` Prisma model and passing doc-comment mentions — zero toggle mutations, zero listing
endpoint, zero frontend UI. Milestone 12 built the entire feature:

- **Write side** (`FavoritesModule`, mirrors `TagsModule`'s pattern of owning per-resource
  controllers): `PUT`/`DELETE /files/:id/favorite` and `PUT`/`DELETE /folders/:id/favorite`,
  both idempotent and gated by the standard `RequirePermission` VIEWER+ check (favoriting doesn't
  modify the resource, so the bar is read access, not edit access).
- **Read side** lives in `SearchModule` (`GET /favorites`), not `FavoritesModule` — reads and
  writes are separate handlers per this project's CQRS-lite convention, and the read side's query
  shape/pagination naturally belongs with `/search` and `/recent`.
- **Schema correction**: `Favorite.folderId`/`fileId` were originally `@unique` (bare), meaning
  only one user total could ever favorite a given file — copied from `Trash`'s shape, where that
  makes sense (trashed-state is one global fact) but is wrong for favorites (a personal, per-viewer
  marker: two different members of a shared workspace should each be able to favorite the same file
  independently). Migration `favorite_per_owner_unique` changed this to a composite
  `@@unique([ownerId, fileId])` / `@@unique([ownerId, folderId])`, and `File.favorite`/
  `Folder.favorite` (singular `Favorite?`) became `favorites` (`Favorite[]`). Safe to change outright
  (rather than an additive migration) because nothing in the codebase had ever actually used the
  old shape yet.
- **Star-state rendering without an N+1**: file/folder list responses (`GET /files`,
  `GET /folders/:id/children`) deliberately do *not* gain an `isFavorited` field — that would mean
  a per-row `Favorite` join on every hot listing query. Instead the frontend calls
  `GET /favorites/check?fileIds=...&folderIds=...` (`FavoritesModule`, batched `IN` query against
  `Favorite`) once per page of results — scoped to exactly the ids on that page, via
  `useFavoritedStatus()` — and cross-references the response locally to render the star on the
  Drive grid/list, search results, and Recent results. The dedicated Favorites page itself uses
  real cursor pagination via `useFavorites()`. An earlier version of this fetched the caller's
  favorites once globally, capped at 100 (`useFavoriteIds()`), and checked membership in that
  fixed set — anything favorited earlier than the 100 most recent silently rendered unfavorited.
  The per-page batched check has no such cap since it only ever asks about ids already in hand.

## The OpenSearch seam

`SearchModule` never imports `FoldersModule` or `FilesModule`, and every caller depends on the
`SearchService` interface (`SEARCH_SERVICE` token) rather than on `PostgresSearchService` directly.
Swapping in OpenSearch later means:

1. Implement `SearchService` against an OpenSearch client (`OpenSearchSearchService`).
2. Swap the `useClass` binding in `search.module.ts`.
3. Add whatever indexing pipeline keeps the OpenSearch index in sync with Postgres writes (e.g. an
   outbox table + worker, mirroring the `BullMQ` checksum-verification pattern already used for
   uploads).

No changes to `SearchController`, the DTOs, or the frontend would be required — they all depend on
the `SearchResultPage`/`SearchResultItem` domain shapes, not on Postgres.

## Frontend

- `SearchBar` (header, all `/drive/*` routes): debounces input 250ms, shows up to 6 instant results
  in a dropdown, "See all results" / Enter navigates to `/drive/search?q=...`.
- `SearchResults` (`/drive/search`): full results page with type/tag/date/workspace/owner filters
  and "Load more" (accumulates pages client-side rather than re-fetching from offset 0 each time).
  A `folderId` scope arrives via query param (e.g. from the command palette, see
  [docs/keyboard-shortcuts.md](keyboard-shortcuts.md)) and renders as a removable chip — there's no
  folder-picker UI, since the only entry point that sets it already knows the folder.
- `/drive/recent` and `/drive/favorites` (Milestone 12): thin pages around `useRecent()` /
  `useFavorites()`, sharing the same `ResultList` row-rendering component as search results.
- `ResultList` (`components/search/result-list.tsx`): the shared row component all three pages
  render — icon, name, content type, a `FavoriteToggleButton`, and click-to-navigate.

`/drive/search/page.tsx` is a server component that wraps the client `SearchResults` component in a
`<Suspense>` boundary — required because `useSearchParams()` triggers a Next.js build-time prerender
error otherwise, even on an already-fully-dynamic route.

See [docs/keyboard-shortcuts.md](keyboard-shortcuts.md) for the command palette (⌘K), which uses
this same search API for its fuzzy file/folder jump.
