import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FAVORITE_REPOSITORY,
  type FavoriteRepository,
} from '../domain/favorite.repository';

@Injectable()
export class SetFolderFavoriteUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
  ) {}

  async execute(
    folderId: string,
    ownerId: string,
    favorited: boolean,
  ): Promise<void> {
    const folder = await this.folders.findByIdUnscoped(folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (favorited) {
      await this.favorites.addFolderFavorite(ownerId, folderId);
    } else {
      await this.favorites.removeFolderFavorite(ownerId, folderId);
    }
  }
}
