import { Inject, Injectable } from '@nestjs/common';
import type { Tag } from '../domain/tag.entity';
import { TAG_REPOSITORY, type TagRepository } from '../domain/tag.repository';

@Injectable()
export class ListTagsUseCase {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  execute(ownerId: string): Promise<Tag[]> {
    return this.tags.findByOwner(ownerId);
  }
}
