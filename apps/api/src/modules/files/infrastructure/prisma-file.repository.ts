import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { File as PrismaFile, StorageObject } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { File } from '../domain/file.entity';
import {
  CopyFileParams,
  CreateFileFromStorageObjectParams,
  CreateFileParams,
  FileRepository,
  FindByFolderParams,
} from '../domain/file.repository';

type FileWithStorageObject = PrismaFile & { storageObject: StorageObject };

function toDomain(row: FileWithStorageObject): File {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    folderId: row.folderId,
    storageObjectId: row.storageObjectId,
    contentType: row.storageObject.contentType,
    size: row.storageObject.size.toString(),
    bucket: row.storageObject.bucket,
    objectKey: row.storageObject.objectKey,
    region: row.storageObject.region,
    lastAccessedAt: row.lastAccessedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaFileRepository implements FileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, ownerId: string): Promise<File | null> {
    const row = await this.prisma.file.findFirst({
      where: { id, ownerId },
      include: { storageObject: true },
    });
    return row ? toDomain(row) : null;
  }

  async findByIdUnscoped(id: string): Promise<File | null> {
    const row = await this.prisma.file.findUnique({
      where: { id },
      include: { storageObject: true },
    });
    return row ? toDomain(row) : null;
  }

  async create(params: CreateFileParams): Promise<File> {
    const row = await this.prisma.file.create({
      data: {
        name: params.name,
        owner: { connect: { id: params.ownerId } },
        folder: { connect: { id: params.folderId } },
        storageObject: {
          create: {
            owner: { connect: { id: params.ownerId } },
            bucket: params.bucket,
            objectKey: `stub/${params.ownerId}/${randomUUID()}`,
            contentType: params.contentType,
            size: BigInt(params.size),
            region: params.region,
          },
        },
      },
      include: { storageObject: true },
    });
    return toDomain(row);
  }

  async createFromStorageObject(
    params: CreateFileFromStorageObjectParams,
  ): Promise<File> {
    const row = await this.prisma.file.create({
      data: {
        name: params.name,
        owner: { connect: { id: params.ownerId } },
        folder: { connect: { id: params.folderId } },
        storageObject: { connect: { id: params.storageObjectId } },
      },
      include: { storageObject: true },
    });
    return toDomain(row);
  }

  /** Ownership must already be verified by the caller (use cases fetch-and-check before renaming). */
  async rename(id: string, _ownerId: string, name: string): Promise<File> {
    const row = await this.prisma.file.update({
      where: { id },
      data: { name },
      include: { storageObject: true },
    });
    return toDomain(row);
  }

  /** `ownerId` is deliberately not part of the WHERE — see PrismaFolderRepository.findChildren
   * for why a folder's contents may span more than one owner, and why `folderId` alone (plus
   * PermissionGuard having already authorized it) is enough to scope this query. */
  async findByFolder(params: FindByFolderParams): Promise<File[]> {
    const { folderId, cursor, limit } = params;
    const rows = await this.prisma.file.findMany({
      // trash: null excludes soft-deleted files — see PrismaFolderRepository.findChildren for
      // why this filter has to be repeated on every listing query rather than living in one place.
      where: { folderId, trash: null },
      include: { storageObject: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map(toDomain);
  }

  /** Ownership must already be verified by the caller, same convention as rename(). */
  async move(id: string, _ownerId: string, folderId: string): Promise<File> {
    const row = await this.prisma.file.update({
      where: { id },
      data: { folder: { connect: { id: folderId } } },
      include: { storageObject: true },
    });
    return toDomain(row);
  }

  async copyToNewStorageObject(params: CopyFileParams): Promise<File> {
    const row = await this.prisma.file.create({
      data: {
        name: params.name,
        owner: { connect: { id: params.ownerId } },
        folder: { connect: { id: params.folderId } },
        storageObject: {
          create: {
            owner: { connect: { id: params.ownerId } },
            bucket: params.bucket,
            objectKey: params.objectKey,
            eTag: params.eTag,
            contentType: params.contentType,
            size: BigInt(params.size),
            region: params.region,
            uploadStatus: 'COMPLETED',
            quotaSubjectType: params.quotaSubjectType,
            quotaSubjectId: params.quotaSubjectId,
          },
        },
      },
      include: { storageObject: true },
    });
    return toDomain(row);
  }

  async softDelete(id: string, ownerId: string): Promise<void> {
    await this.prisma.trash.create({ data: { ownerId, fileId: id } });
  }

  /** Finds files by `folderId` alone (not `ownerId`) — a subtree being trashed may contain files
   * created by different collaborators (see findByFolder), but every Trash row this writes is
   * stamped with the single `ownerId` the caller passes (the deleted folder's own owner), so the
   * whole subtree lands in one consistent trash bin regardless of individual file ownership. */
  async softDeleteByFolderIds(
    folderIds: string[],
    ownerId: string,
  ): Promise<number> {
    if (folderIds.length === 0) return 0;

    const files = await this.prisma.file.findMany({
      where: { folderId: { in: folderIds } },
      select: { id: true },
    });
    if (files.length === 0) return 0;

    const result = await this.prisma.trash.createMany({
      data: files.map((file) => ({ ownerId, fileId: file.id })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async restore(id: string, ownerId: string): Promise<void> {
    await this.prisma.trash.deleteMany({ where: { ownerId, fileId: id } });
  }

  async isTrashed(id: string): Promise<boolean> {
    const trash = await this.prisma.trash.findUnique({
      where: { fileId: id },
      select: { id: true },
    });
    return trash !== null;
  }

  async restoreByFolderIds(
    folderIds: string[],
    ownerId: string,
  ): Promise<number> {
    if (folderIds.length === 0) return 0;

    const files = await this.prisma.file.findMany({
      where: { folderId: { in: folderIds } },
      select: { id: true },
    });
    if (files.length === 0) return 0;

    const result = await this.prisma.trash.deleteMany({
      where: { ownerId, fileId: { in: files.map((file) => file.id) } },
    });
    return result.count;
  }

  /** `ownerId` unused — see softDeleteByFolderIds for why folder contents can span owners. */
  async findByFolderIds(
    folderIds: string[],
    _ownerId: string,
  ): Promise<File[]> {
    if (folderIds.length === 0) return [];
    const rows = await this.prisma.file.findMany({
      where: { folderId: { in: folderIds } },
      include: { storageObject: true },
    });
    return rows.map(toDomain);
  }

  async updateCurrentStorageObject(
    id: string,
    _ownerId: string,
    storageObjectId: string,
  ): Promise<File> {
    const row = await this.prisma.file.update({
      where: { id },
      data: { storageObject: { connect: { id: storageObjectId } } },
      include: { storageObject: true },
    });
    return toDomain(row);
  }

  async touchLastAccessed(id: string): Promise<void> {
    await this.prisma.file.update({
      where: { id },
      data: { lastAccessedAt: new Date() },
      select: { id: true },
    });
  }
}
