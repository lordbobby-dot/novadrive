import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import type { Tag } from '../domain/tag.entity';
import { TAG_REPOSITORY, type TagRepository } from '../domain/tag.repository';

@Injectable()
export class SetFileTagsUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
  ) {}

  async execute(params: {
    fileId: string;
    ownerId: string;
    names: string[];
  }): Promise<Tag[]> {
    const { fileId, ownerId, names } = params;

    const file = await this.files.findByIdUnscoped(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const resolvedTags = await this.tags.findOrCreateMany(ownerId, names);
    await this.tags.setFileTags(
      fileId,
      ownerId,
      resolvedTags.map((tag) => tag.id),
    );
    return resolvedTags;
  }
}
