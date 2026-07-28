import { Inject, Injectable } from '@nestjs/common';
import {
  FAVORITE_REPOSITORY,
  type FavoritedIds,
  type FavoriteRepository,
} from '../domain/favorite.repository';

/** Backs `GET /favorites/check` — a single batched existence check scoped to whatever page of
 * file/folder ids the caller is currently rendering (Drive listing, search results, recent),
 * rather than the frontend fetching the owner's entire favorites set capped at a fixed size and
 * checking membership in memory. That capped-fetch approach silently reported `false` for any
 * item favorited earlier than the cap, even though it genuinely was favorited — this endpoint has
 * no such limit since it only ever needs to know about ids the caller already asked about. */
@Injectable()
export class CheckFavoritedUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
  ) {}

  async execute(
    ownerId: string,
    fileIds: string[],
    folderIds: string[],
  ): Promise<FavoritedIds> {
    if (fileIds.length === 0 && folderIds.length === 0) {
      return { fileIds: [], folderIds: [] };
    }
    return this.favorites.findFavoritedIds(ownerId, { fileIds, folderIds });
  }
}
