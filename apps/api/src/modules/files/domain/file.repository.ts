import { File } from './file.entity';
import type { QuotaSubjectType } from '../../quota/domain/storage-quota.entity';

export const FILE_REPOSITORY = Symbol('FILE_REPOSITORY');

export interface CreateFileParams {
  ownerId: string;
  folderId: string;
  name: string;
  contentType: string;
  size: string;
  bucket: string;
  region: string;
}

export interface CreateFileFromStorageObjectParams {
  ownerId: string;
  folderId: string;
  name: string;
  storageObjectId: string;
}

export interface FindByFolderParams {
  ownerId: string;
  folderId: string;
  cursor?: string;
  limit: number;
}

export interface CopyFileParams {
  ownerId: string;
  folderId: string;
  name: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  size: string;
  region: string;
  eTag: string;
  quotaSubjectType: QuotaSubjectType;
  quotaSubjectId: string;
}

export interface FileRepository {
  findById(id: string, ownerId: string): Promise<File | null>;
  /** Looks up a file by id without filtering by owner — see FolderRepository.findByIdUnscoped
   * for why PermissionResolver needs this. */
  findByIdUnscoped(id: string): Promise<File | null>;
  create(params: CreateFileParams): Promise<File>;
  /** Links a File to a StorageObject that already exists — the real upload-pipeline path,
   * as opposed to `create`'s stub-StorageObject path used for M2-era seeding/testing. */
  createFromStorageObject(
    params: CreateFileFromStorageObjectParams,
  ): Promise<File>;
  rename(id: string, ownerId: string, name: string): Promise<File>;
  /** Returns up to `limit + 1` rows (caller derives the next cursor from the lookahead row). */
  findByFolder(params: FindByFolderParams): Promise<File[]>;
  move(id: string, ownerId: string, folderId: string): Promise<File>;
  /** Creates a brand-new StorageObject (already COMPLETED — the S3 copy that produced it was
   * already verified by S3 itself) and a File pointing at it, in one write. Never reuses the
   * source's StorageObject: File.storageObjectId is unique, so two Files sharing one
   * StorageObject would make later per-file delete/versioning ambiguous. */
  copyToNewStorageObject(params: CopyFileParams): Promise<File>;
  /** Soft-deletes a single file (creates its Trash row). */
  softDelete(id: string, ownerId: string): Promise<void>;
  /** Soft-deletes every file in the given folders in one batched insert — used by recursive
   * folder delete, where the folder ids come from FolderRepository.softDeleteSubtree. Returns
   * the count actually trashed. */
  softDeleteByFolderIds(folderIds: string[], ownerId: string): Promise<number>;
  /** Deletes a single file's Trash row (does not touch folderId — restoring to the original
   * location is just "the Trash row is gone", since soft-delete never moved the file). */
  restore(id: string, ownerId: string): Promise<void>;
  isTrashed(id: string): Promise<boolean>;
  /** Deletes the Trash rows for every file in the given folders in one batched query — the file
   * side of restoring a folder subtree, mirroring softDeleteByFolderIds. Returns the count
   * actually restored. */
  restoreByFolderIds(folderIds: string[], ownerId: string): Promise<number>;
  /** All files directly inside any of the given folders (not recursive on its own — pass every
   * descendant folder id from FolderRepository.findDescendantIds to cover a subtree). Used by
   * permanent-delete to find every StorageObject that needs S3 cleanup before the folder rows can
   * be dropped. */
  findByFolderIds(folderIds: string[], ownerId: string): Promise<File[]>;
  /** Rewrites which StorageObject a file's content currently points at, without touching name,
   * folder, or any other field — used when a new version is uploaded (points at the new object)
   * or an old version is restored (points back at that version's object). */
  updateCurrentStorageObject(
    id: string,
    ownerId: string,
    storageObjectId: string,
  ): Promise<File>;
  /** Stamps `lastAccessedAt` to now — called whenever a download or preview signed URL is
   * actually issued (see GetDownloadUrlUseCase/GetPreviewUrlUseCase), never on mere metadata
   * fetches (GetFileUseCase), so "Recent" reflects genuine content access. Fire-and-forget from
   * the caller's perspective — never blocks or fails the signed-URL response it's attached to. */
  touchLastAccessed(id: string): Promise<void>;
}
