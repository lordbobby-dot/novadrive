export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

export interface FindFavoritedIdsParams {
  fileIds: string[];
  folderIds: string[];
}

export interface FavoritedIds {
  fileIds: string[];
  folderIds: string[];
}

export interface FavoriteRepository {
  /** Idempotent — favoriting an already-favorited file is a no-op, not an error. */
  addFileFavorite(ownerId: string, fileId: string): Promise<void>;
  /** Idempotent — unfavoriting a file that isn't favorited is a no-op, not an error. */
  removeFileFavorite(ownerId: string, fileId: string): Promise<void>;
  addFolderFavorite(ownerId: string, folderId: string): Promise<void>;
  removeFolderFavorite(ownerId: string, folderId: string): Promise<void>;
  isFileFavorited(ownerId: string, fileId: string): Promise<boolean>;
  isFolderFavorited(ownerId: string, folderId: string): Promise<boolean>;
  /** Which of the given file/folder ids `ownerId` has favorited — a single batched `IN` query
   * per type, scoped to whatever page of ids the caller is currently rendering, rather than
   * fetching the owner's entire favorites set capped at some arbitrary size (see docs/search.md
   * for the bug this replaced: star state going stale/false past a fixed favorite count). */
  findFavoritedIds(
    ownerId: string,
    params: FindFavoritedIdsParams,
  ): Promise<FavoritedIds>;
}
