import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import type { Tag } from '../domain/tag.entity';
import { TAG_REPOSITORY, type TagRepository } from '../domain/tag.repository';

@Injectable()
export class GetFolderTagsUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
  ) {}

  async execute(folderId: string, ownerId: string): Promise<Tag[]> {
    const folder = await this.folders.findById(folderId, ownerId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return this.tags.getFolderTags(folderId);
  }
}
