export type TrashItemType = 'file' | 'folder';

/** One row per top-level trashed item — a trashed folder whose parent isn't also trashed, or a
 * trashed file whose containing folder isn't also trashed. A folder deleted with 1000 descendants
 * produces 1001 Trash rows in the DB, but exactly one TrashListItem, matching how a user thinks
 * about "the thing I deleted" rather than every row the delete happened to touch. */
export interface TrashListItem {
  trashId: string;
  type: TrashItemType;
  id: string;
  name: string;
  deletedAt: Date;
}

export interface ExpiredTrashRoot {
  type: TrashItemType;
  id: string;
  ownerId: string;
}

export interface StorageObjectLocation {
  id: string;
  bucket: string;
  objectKey: string;
  size: string;
  /** Both null for a StorageObject created outside the real upload pipeline — such objects were
   * never reserved against any quota, so permanent-delete has nothing to release for them. */
  quotaSubjectType: 'USER' | 'ORGANIZATION' | null;
  quotaSubjectId: string | null;
}
