import { SearchResultPage, SearchResultType } from './search-result.entity';

export const SEARCH_SERVICE = Symbol('SEARCH_SERVICE');

export interface SearchQuery {
  /** The requesting user — always the base scope for personal search (unchanged since M5).
   * Ignored as the base scope when `workspaceId` is set (a workspace is a shared pool, not
   * owner-scoped), but still available as a tag-ownership scope (tags remain personal even
   * inside a workspace search — see PostgresSearchService). */
  ownerId: string;
  q: string;
  type?: SearchResultType;
  dateFrom?: Date;
  dateTo?: Date;
  /** A tag *name*, not id — the frontend deals in names, and names are unique per owner. */
  tag?: string;
  /** Switches the base scope from `ownerId`'s personal Drive to this workspace's shared content —
   * every file/folder inside it, regardless of who created it. Caller must have already verified
   * VIEWER+ org membership (see SearchUseCase) before this is ever set; PostgresSearchService
   * trusts it unconditionally. */
  workspaceId?: string;
  /** Additional filter: only items actually owned/created by this specific user id. A no-op
   * within personal search (there's only ever one owner — yourself), genuinely useful within a
   * workspace search where multiple members' uploads coexist. */
  owner?: string;
  /** Restrict to this folder's subtree (the folder itself and every descendant, at any depth) —
   * same materialized-path-prefix technique FolderRepository.findDescendantIds uses. */
  folderId?: string;
  cursor?: string;
  limit: number;
}

export interface RecentQuery {
  ownerId: string;
  workspaceId?: string;
  cursor?: string;
  limit: number;
}

export interface FavoritesQuery {
  ownerId: string;
  cursor?: string;
  limit: number;
}

/**
 * Port for full-text search plus the two related read-model listings (Recent, Favorites) that
 * share its query shape and pagination style. Backed by Postgres FTS/plain queries today (see
 * PostgresSearchService); kept as an interface so the query surface (search use case, controller)
 * never has to change if this is ever swapped for a dedicated search engine like OpenSearch at a
 * larger scale.
 */
export interface SearchService {
  search(query: SearchQuery): Promise<SearchResultPage>;
  /** Files only (folders have no "opened" concept) — see File.lastAccessedAt — ordered most
   * recently accessed first. */
  listRecent(query: RecentQuery): Promise<SearchResultPage>;
  /** Files and folders the owner has favorited, ordered most recently favorited first. */
  listFavorites(query: FavoritesQuery): Promise<SearchResultPage>;
}
