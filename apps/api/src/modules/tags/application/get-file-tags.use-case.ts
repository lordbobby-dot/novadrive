import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import type { Tag } from '../domain/tag.entity';
import { TAG_REPOSITORY, type TagRepository } from '../domain/tag.repository';

@Injectable()
export class GetFileTagsUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
  ) {}

  async execute(fileId: string, _actorId: string): Promise<Tag[]> {
    const file = await this.files.findByIdUnscoped(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return this.tags.getFileTags(fileId);
  }
}
