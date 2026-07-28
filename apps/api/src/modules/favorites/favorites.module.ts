import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { FAVORITE_REPOSITORY } from './domain/favorite.repository';
import { PrismaFavoriteRepository } from './infrastructure/prisma-favorite.repository';
import { SetFileFavoriteUseCase } from './application/set-file-favorite.use-case';
import { SetFolderFavoriteUseCase } from './application/set-folder-favorite.use-case';
import { CheckFavoritedUseCase } from './application/check-favorited.use-case';
import { FileFavoritesController } from './interface/file-favorites.controller';
import { FolderFavoritesController } from './interface/folder-favorites.controller';
import { FavoritesStatusController } from './interface/favorites-status.controller';

/** Write side (toggle favorite/unfavorite) plus the batched status check (GET /favorites/check)
 * — the paginated listing (GET /favorites) lives in SearchModule alongside GET /search and
 * GET /recent, per the project's CQRS-lite convention of separating read and write handlers. The
 * status check isn't a paginated list though (it's a lookup by ids the caller already has), so it
 * stays here next to the FavoriteRepository it queries directly. See
 * SearchModule/ListFavoritesUseCase. */
@Module({
  imports: [FoldersModule, FilesModule],
  controllers: [
    FileFavoritesController,
    FolderFavoritesController,
    FavoritesStatusController,
  ],
  providers: [
    { provide: FAVORITE_REPOSITORY, useClass: PrismaFavoriteRepository },
    SetFileFavoriteUseCase,
    SetFolderFavoriteUseCase,
    CheckFavoritedUseCase,
  ],
})
export class FavoritesModule {}
