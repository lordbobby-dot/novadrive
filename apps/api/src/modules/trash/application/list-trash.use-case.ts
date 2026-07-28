import { Inject, Injectable } from '@nestjs/common';
import type { TrashListItem } from '../domain/trash.entity';
import {
  TRASH_REPOSITORY,
  type TrashRepository,
} from '../domain/trash.repository';

export interface TrashPage {
  items: TrashListItem[];
  nextCursor: string | null;
}

@Injectable()
export class ListTrashUseCase {
  constructor(
    @Inject(TRASH_REPOSITORY) private readonly trash: TrashRepository,
  ) {}

  async execute(params: {
    ownerId: string;
    cursor?: string;
    limit: number;
  }): Promise<TrashPage> {
    const offset = params.cursor ? Number(params.cursor) : 0;
    const rows = await this.trash.listRoots(params);

    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? String(offset + params.limit) : null;

    return { items, nextCursor };
  }
}
