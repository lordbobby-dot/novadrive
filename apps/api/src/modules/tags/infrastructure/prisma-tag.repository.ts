import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Tag } from '../domain/tag.entity';
import { TagRepository } from '../domain/tag.repository';

@Injectable()
export class PrismaTagRepository implements TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOwner(ownerId: string): Promise<Tag[]> {
    return this.prisma.tag.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async findOrCreateMany(ownerId: string, names: string[]): Promise<Tag[]> {
    const uniqueNames = [
      ...new Set(names.map((name) => name.trim()).filter(Boolean)),
    ];
    if (uniqueNames.length === 0) return [];

    await this.prisma.tag.createMany({
      data: uniqueNames.map((name) => ({ ownerId, name })),
      skipDuplicates: true,
    });
    return this.prisma.tag.findMany({
      where: { ownerId, name: { in: uniqueNames } },
    });
  }

  async getFileTags(fileId: string): Promise<Tag[]> {
    const rows = await this.prisma.fileTag.findMany({
      where: { fileId },
      include: { tag: true },
      orderBy: { tag: { name: 'asc' } },
    });
    return rows.map((row) => row.tag);
  }

  async getFolderTags(folderId: string): Promise<Tag[]> {
    const rows = await this.prisma.folderTag.findMany({
      where: { folderId },
      include: { tag: true },
      orderBy: { tag: { name: 'asc' } },
    });
    return rows.map((row) => row.tag);
  }

  /** Ownership already verified by the caller, same convention as the other repositories. */
  async setFileTags(
    fileId: string,
    _ownerId: string,
    tagIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.fileTag.deleteMany({ where: { fileId } }),
      this.prisma.fileTag.createMany({
        data: tagIds.map((tagId) => ({ fileId, tagId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async setFolderTags(
    folderId: string,
    _ownerId: string,
    tagIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.folderTag.deleteMany({ where: { folderId } }),
      this.prisma.folderTag.createMany({
        data: tagIds.map((tagId) => ({ folderId, tagId })),
        skipDuplicates: true,
      }),
    ]);
  }
}
