import {
  ExpiredTrashRoot,
  StorageObjectLocation,
  TrashItemType,
  TrashListItem,
} from './trash.entity';

export const TRASH_REPOSITORY = Symbol('TRASH_REPOSITORY');

export interface ListTrashParams {
  ownerId: string;
  cursor?: string;
  limit: number;
}

export interface TrashRepository {
  /** Root trash entries only, newest-deleted first. Same offset-cursor tradeoff as search (see
   * docs/search.md#pagination-offset-not-keyset) — a UNION across two tables filtered to "root"
   * rows isn't a simple single-table keyset. */
  listRoots(params: ListTrashParams): Promise<TrashListItem[]>;
  /** Resolves a Trash row's own id to which file or folder it marks — `DELETE /trash/:id/permanent`
   * takes this id (not the file/folder's own id) so a single endpoint can dispatch to either
   * permanent-delete flow without the client needing to know the type in advance. */
  findById(
    trashId: string,
    ownerId: string,
  ): Promise<{ type: TrashItemType; id: string } | null>;
  /** Every root trash entry (across all owners) older than `cutoff` — the cleanup job's sweep
   * list. Purging a root permanently deletes its entire subtree, so only roots need to be found
   * here, not every descendant row. */
  findExpiredRoots(cutoff: Date): Promise<ExpiredTrashRoot[]>;
  getStorageObjectLocations(ids: string[]): Promise<StorageObjectLocation[]>;
  /** Deletes StorageObject rows outright — cascades (via the DB schema) to delete the File,
   * every FileVersion pointing at it, and any Trash/Tag/Favorite row for that file. Callers must
   * delete the matching S3 objects first; this only cleans up Postgres. */
  deleteStorageObjects(ids: string[]): Promise<void>;
}
