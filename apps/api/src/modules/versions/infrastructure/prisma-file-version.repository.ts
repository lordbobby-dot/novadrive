import { Injectable } from '@nestjs/common';
import type {
  FileVersion as PrismaFileVersion,
  StorageObject,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { FileVersion } from '../domain/file-version.entity';
import {
  CreateFileVersionParams,
  FileVersionRepository,
} from '../domain/file-version.repository';

type RowWithStorageObject = PrismaFileVersion & {
  storageObject: StorageObject;
};

function toDomain(row: RowWithStorageObject): FileVersion {
  return {
    id: row.id,
    fileId: row.fileId,
    storageObjectId: row.storageObjectId,
    versionNumber: row.versionNumber,
    createdBy: row.createdBy,
    changeNote: row.changeNote,
    createdAt: row.createdAt,
    contentType: row.storageObject.contentType,
    size: row.storageObject.size.toString(),
    bucket: row.storageObject.bucket,
    objectKey: row.storageObject.objectKey,
    region: row.storageObject.region,
  };
}

@Injectable()
export class PrismaFileVersionRepository implements FileVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByFile(fileId: string): Promise<FileVersion[]> {
    const rows = await this.prisma.fileVersion.findMany({
      where: { fileId },
      include: { storageObject: true },
      orderBy: { versionNumber: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findByFileAndNumber(
    fileId: string,
    versionNumber: number,
  ): Promise<FileVersion | null> {
    const row = await this.prisma.fileVersion.findUnique({
      where: { fileId_versionNumber: { fileId, versionNumber } },
      include: { storageObject: true },
    });
    return row ? toDomain(row) : null;
  }

  async create(params: CreateFileVersionParams): Promise<FileVersion> {
    const row = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.fileVersion.aggregate({
        where: { fileId: params.fileId },
        _max: { versionNumber: true },
      });
      const versionNumber = (agg._max.versionNumber ?? 0) + 1;

      return tx.fileVersion.create({
        data: {
          fileId: params.fileId,
          storageObjectId: params.storageObjectId,
          versionNumber,
          createdBy: params.createdBy,
          changeNote: params.changeNote,
        },
        include: { storageObject: true },
      });
    });
    return toDomain(row);
  }

  async listStorageObjectIdsForFiles(fileIds: string[]): Promise<string[]> {
    if (fileIds.length === 0) return [];
    const rows = await this.prisma.fileVersion.findMany({
      where: { fileId: { in: fileIds } },
      select: { storageObjectId: true },
    });
    return rows.map((row) => row.storageObjectId);
  }
}
