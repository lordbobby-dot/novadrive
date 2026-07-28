import { FileVersion } from './file-version.entity';

export const FILE_VERSION_REPOSITORY = Symbol('FILE_VERSION_REPOSITORY');

export interface CreateFileVersionParams {
  fileId: string;
  storageObjectId: string;
  createdBy: string;
  changeNote?: string;
}

export interface FileVersionRepository {
  /** Newest first — the natural order for a version-history panel. */
  listByFile(fileId: string): Promise<FileVersion[]>;
  findByFileAndNumber(
    fileId: string,
    versionNumber: number,
  ): Promise<FileVersion | null>;
  /** Computes the next versionNumber (current max + 1, starting at 1) and inserts the row in one
   * transaction — accepts the small race-window this implies under truly concurrent
   * new-version uploads for the same file, which isn't a scenario this app's single-editor
   * upload flow produces in practice. */
  create(params: CreateFileVersionParams): Promise<FileVersion>;
  /** Every StorageObject id ever pointed at by any version of any of the given files — the full
   * set that must be deleted from S3 (and the DB) before permanent-deleting those files, so no
   * historical version's object is left orphaned. */
  listStorageObjectIdsForFiles(fileIds: string[]): Promise<string[]>;
}
