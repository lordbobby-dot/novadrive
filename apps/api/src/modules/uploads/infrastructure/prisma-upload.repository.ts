import { Injectable } from '@nestjs/common';
import type { StorageObject } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  UploadPartRecord,
  UploadSession,
} from '../domain/upload-session.entity';
import {
  AddPartParams,
  CreateUploadSessionParams,
  UploadRepository,
} from '../domain/upload.repository';

function toDomain(row: StorageObject): UploadSession {
  return {
    id: row.id,
    ownerId: row.ownerId,
    bucket: row.bucket,
    objectKey: row.objectKey,
    contentType: row.contentType,
    size: row.size.toString(),
    status: row.uploadStatus,
    uploadId: row.uploadId,
    partSize: row.partSize?.toString() ?? null,
    totalParts: row.totalParts,
    clientChecksum: row.clientChecksum,
    quotaSubjectType: row.quotaSubjectType,
    quotaSubjectId: row.quotaSubjectId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaUploadRepository implements UploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateUploadSessionParams): Promise<UploadSession> {
    const row = await this.prisma.storageObject.create({
      data: {
        owner: { connect: { id: params.ownerId } },
        bucket: params.bucket,
        objectKey: params.objectKey,
        region: params.region,
        contentType: params.contentType,
        size: BigInt(params.size),
        partSize: BigInt(params.partSize),
        totalParts: params.totalParts,
        clientChecksum: params.clientChecksum,
        quotaSubjectType: params.quotaSubjectType,
        quotaSubjectId: params.quotaSubjectId,
        uploadStatus: 'PENDING',
      },
    });
    return toDomain(row);
  }

  async findById(id: string, ownerId: string): Promise<UploadSession | null> {
    const row = await this.prisma.storageObject.findFirst({
      where: { id, ownerId },
    });
    return row ? toDomain(row) : null;
  }

  async findStale(olderThan: Date): Promise<UploadSession[]> {
    const rows = await this.prisma.storageObject.findMany({
      where: {
        uploadStatus: { in: ['PENDING', 'UPLOADING'] },
        createdAt: { lt: olderThan },
      },
    });
    return rows.map(toDomain);
  }

  async setUploading(id: string, uploadId: string): Promise<UploadSession> {
    const row = await this.prisma.storageObject.update({
      where: { id },
      data: { uploadId, uploadStatus: 'UPLOADING' },
    });
    return toDomain(row);
  }

  async addPart(params: AddPartParams): Promise<void> {
    await this.prisma.uploadPart.upsert({
      where: {
        storageObjectId_partNumber: {
          storageObjectId: params.storageObjectId,
          partNumber: params.partNumber,
        },
      },
      create: {
        storageObject: { connect: { id: params.storageObjectId } },
        partNumber: params.partNumber,
        eTag: params.eTag,
        size: BigInt(params.size),
      },
      update: { eTag: params.eTag, size: BigInt(params.size) },
    });
  }

  async listParts(storageObjectId: string): Promise<UploadPartRecord[]> {
    const rows = await this.prisma.uploadPart.findMany({
      where: { storageObjectId },
      orderBy: { partNumber: 'asc' },
    });
    return rows.map((row) => ({
      partNumber: row.partNumber,
      eTag: row.eTag,
      size: row.size.toString(),
    }));
  }

  async recordETag(id: string, eTag: string): Promise<void> {
    await this.prisma.storageObject.update({ where: { id }, data: { eTag } });
  }

  async markCompleted(id: string): Promise<UploadSession> {
    const row = await this.prisma.storageObject.update({
      where: { id },
      data: { uploadStatus: 'COMPLETED' },
    });
    return toDomain(row);
  }

  async markAborted(id: string): Promise<void> {
    await this.prisma.storageObject.update({
      where: { id },
      data: { uploadStatus: 'ABORTED' },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.storageObject.update({
      where: { id },
      data: { uploadStatus: 'FAILED' },
    });
  }

  async markQuarantined(id: string): Promise<void> {
    await this.prisma.storageObject.update({
      where: { id },
      data: { uploadStatus: 'QUARANTINED' },
    });
  }

  async markChecksumVerified(id: string, checksum: string): Promise<void> {
    await this.prisma.storageObject.update({
      where: { id },
      data: { checksum },
    });
  }
}
