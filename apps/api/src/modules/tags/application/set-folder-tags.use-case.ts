import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import type { Tag } from '../domain/tag.entity';
import { TAG_REPOSITORY, type TagRepository } from '../domain/tag.repository';

@Injectable()
export class SetFolderTagsUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
  ) {}

  async execute(params: {
    folderId: string;
    ownerId: string;
    names: string[];
  }): Promise<Tag[]> {
    const { folderId, ownerId, names } = params;

    const folder = await this.folders.findById(folderId, ownerId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const resolvedTags = await this.tags.findOrCreateMany(ownerId, names);
    await this.tags.setFolderTags(
      folderId,
      ownerId,
      resolvedTags.map((tag) => tag.id),
    );
    return resolvedTags;
  }
}
