import { Folder } from './folder.entity';

export const FOLDER_REPOSITORY = Symbol('FOLDER_REPOSITORY');

export interface FindChildrenParams {
  ownerId: string;
  parentId: string;
  cursor?: string;
  limit: number;
}

export interface MoveFolderParams {
  id: string;
  ownerId: string;
  newParentId: string;
  newPath: string;
  newDepth: number;
}

export interface FolderRepository {
  findById(id: string, ownerId: string): Promise<Folder | null>;
  /** Looks up a folder by id without filtering by owner — needed by PermissionResolver, which
   * must be able to fetch a resource to check its `ownerId` even when the caller isn't the
   * owner (that's the entire point of sharing). Every other read in this app intentionally
   * scopes by owner; this is the one deliberate exception. */
  findByIdUnscoped(id: string): Promise<Folder | null>;
  findByIds(ids: string[], ownerId: string): Promise<Folder[]>;
  findRoot(ownerId: string): Promise<Folder | null>;
  createRoot(ownerId: string): Promise<Folder>;
  /** The workspace-scoped analog of createRoot — created once, eagerly, by
   * CreateWorkspaceUseCase rather than lazily get-or-created, so (unlike createRoot) there's no
   * unique-constraint race to handle here. */
  createWorkspaceRoot(params: {
    ownerId: string;
    organizationId: string;
    workspaceId: string;
    name: string;
  }): Promise<Folder>;
  findWorkspaceRoot(workspaceId: string): Promise<Folder | null>;
  create(params: {
    ownerId: string;
    parentId: string;
    name: string;
    path: string;
    depth: number;
    organizationId?: string | null;
    workspaceId?: string | null;
  }): Promise<Folder>;
  rename(id: string, ownerId: string, name: string): Promise<Folder>;
  /** Returns up to `limit + 1` rows (caller derives the next cursor from the lookahead row). */
  findChildren(params: FindChildrenParams): Promise<Folder[]>;
  /** All descendant folder ids at any depth (not including the folder itself), found via a
   * materialized-path prefix match — a single indexed query regardless of subtree size. */
  findDescendantIds(folderId: string, ownerId: string): Promise<string[]>;
  /** Rewrites the folder's own parentId/path/depth and re-prefixes every descendant's path/depth
   * in one batched UPDATE, so moving a folder with a large subtree costs one query, not one per
   * descendant. */
  move(params: MoveFolderParams): Promise<Folder>;
  /** Soft-deletes the folder and its entire subtree by batch-inserting Trash rows (one
   * `createMany`, not one insert per folder). Returns every folder id trashed (self + all
   * descendants) so the caller can also trash the files inside them. */
  softDeleteSubtree(folderId: string, ownerId: string): Promise<string[]>;
  /** Whether this folder currently has a Trash row (is itself trashed — not whether an ancestor
   * is trashed). Used by file/folder restore to decide whether the original location is still a
   * sane restore target or a fallback (the user's root) is needed instead. */
  isTrashed(id: string): Promise<boolean>;
  /** Inverse of `softDeleteSubtree` — deletes the Trash rows for the folder and its entire
   * subtree in one batched query. Returns every folder id restored. */
  restoreSubtree(folderId: string, ownerId: string): Promise<string[]>;
  /** Permanently deletes the folder row. Cascades (via the DB schema) to delete every descendant
   * Folder, any remaining File rows in them, and their Trash/Tag/Favorite rows — callers must
   * have already cleaned up StorageObjects for any files in the subtree first, since deleting a
   * File row does not cascade to its StorageObject. */
  deleteRow(id: string): Promise<void>;
}
