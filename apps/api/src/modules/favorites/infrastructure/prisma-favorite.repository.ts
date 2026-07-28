import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  FavoritedIds,
  FavoriteRepository,
  FindFavoritedIdsParams,
} from '../domain/favorite.repository';

@Injectable()
export class PrismaFavoriteRepository implements FavoriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async addFileFavorite(ownerId: string, fileId: string): Promise<void> {
    await this.prisma.favorite.upsert({
      where: { ownerId_fileId: { ownerId, fileId } },
      create: { ownerId, fileId },
      update: {},
    });
  }

  async removeFileFavorite(ownerId: string, fileId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { ownerId, fileId } });
  }

  async addFolderFavorite(ownerId: string, folderId: string): Promise<void> {
    await this.prisma.favorite.upsert({
      where: { ownerId_folderId: { ownerId, folderId } },
      create: { ownerId, folderId },
      update: {},
    });
  }

  async removeFolderFavorite(ownerId: string, folderId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { ownerId, folderId } });
  }

  async isFileFavorited(ownerId: string, fileId: string): Promise<boolean> {
    const favorite = await this.prisma.favorite.findUnique({
      where: { ownerId_fileId: { ownerId, fileId } },
      select: { id: true },
    });
    return favorite !== null;
  }

  async isFolderFavorited(ownerId: string, folderId: string): Promise<boolean> {
    const favorite = await this.prisma.favorite.findUnique({
      where: { ownerId_folderId: { ownerId, folderId } },
      select: { id: true },
    });
    return favorite !== null;
  }

  async findFavoritedIds(
    ownerId: string,
    { fileIds, folderIds }: FindFavoritedIdsParams,
  ): Promise<FavoritedIds> {
    const [favoritedFiles, favoritedFolders] = await Promise.all([
      fileIds.length
        ? this.prisma.favorite.findMany({
            where: { ownerId, fileId: { in: fileIds } },
            select: { fileId: true },
          })
        : [],
      folderIds.length
        ? this.prisma.favorite.findMany({
            where: { ownerId, folderId: { in: folderIds } },
            select: { folderId: true },
          })
        : [],
    ]);
    return {
      fileIds: favoritedFiles.map((row) => row.fileId!),
      folderIds: favoritedFolders.map((row) => row.folderId!),
    };
  }
}
