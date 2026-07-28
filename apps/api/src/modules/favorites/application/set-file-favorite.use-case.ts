import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  FAVORITE_REPOSITORY,
  type FavoriteRepository,
} from '../domain/favorite.repository';

@Injectable()
export class SetFileFavoriteUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
  ) {}

  async execute(
    fileId: string,
    ownerId: string,
    favorited: boolean,
  ): Promise<void> {
    const file = await this.files.findByIdUnscoped(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (favorited) {
      await this.favorites.addFileFavorite(ownerId, fileId);
    } else {
      await this.favorites.removeFileFavorite(ownerId, fileId);
    }
  }
}
