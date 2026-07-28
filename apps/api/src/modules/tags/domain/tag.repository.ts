import { Tag } from './tag.entity';

export const TAG_REPOSITORY = Symbol('TAG_REPOSITORY');

export interface TagRepository {
  findByOwner(ownerId: string): Promise<Tag[]>;
  /** Idempotent — existing tags with these names are reused rather than duplicated (unique per
   * (ownerId, name)), new ones are created. */
  findOrCreateMany(ownerId: string, names: string[]): Promise<Tag[]>;
  getFileTags(fileId: string): Promise<Tag[]>;
  getFolderTags(folderId: string): Promise<Tag[]>;
  /** Replaces the file's entire tag set with exactly these tag ids. */
  setFileTags(fileId: string, ownerId: string, tagIds: string[]): Promise<void>;
  /** Replaces the folder's entire tag set with exactly these tag ids. */
  setFolderTags(
    folderId: string,
    ownerId: string,
    tagIds: string[],
  ): Promise<void>;
}
