import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  QuotaSubjectType,
  StorageQuota,
} from '../domain/storage-quota.entity';
import type {
  StorageBreakdownEntry,
  StorageQuotaRepository,
} from '../domain/storage-quota.repository';

type StorageQuotaRow = {
  id: string;
  subjectType: QuotaSubjectType;
  subjectId: string;
  limitBytes: bigint;
  usedBytes: bigint;
  lastNotifiedThreshold: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: StorageQuotaRow): StorageQuota {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    limitBytes: row.limitBytes.toString(),
    usedBytes: row.usedBytes.toString(),
    lastNotifiedThreshold: row.lastNotifiedThreshold,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Statuses whose reservation is still "live" — everything that hasn't been explicitly released
 * (ABORTED/FAILED/QUARANTINED all release their reservation via QuotaService.release when they
 * transition, so they're excluded here to keep the breakdown consistent with usedBytes). */
const LIVE_UPLOAD_STATUSES = ['PENDING', 'UPLOADING', 'COMPLETED'] as const;

@Injectable()
export class PrismaStorageQuotaRepository implements StorageQuotaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySubject(
    subjectType: QuotaSubjectType,
    subjectId: string,
  ): Promise<StorageQuota | null> {
    const row = await this.prisma.storageQuota.findUnique({
      where: { subjectType_subjectId: { subjectType, subjectId } },
    });
    return row ? toDomain(row) : null;
  }

  async findManyBySubjects(
    subjectType: QuotaSubjectType,
    subjectIds: string[],
  ): Promise<StorageQuota[]> {
    if (subjectIds.length === 0) return [];
    const rows = await this.prisma.storageQuota.findMany({
      where: { subjectType, subjectId: { in: subjectIds } },
    });
    return rows.map(toDomain);
  }

  async getOrCreate(
    subjectType: QuotaSubjectType,
    subjectId: string,
    defaultLimitBytes: number,
  ): Promise<StorageQuota> {
    const row = await this.prisma.storageQuota.upsert({
      where: { subjectType_subjectId: { subjectType, subjectId } },
      create: {
        subjectType,
        subjectId,
        limitBytes: BigInt(defaultLimitBytes),
      },
      update: {},
    });
    return toDomain(row);
  }

  async setLimit(
    subjectType: QuotaSubjectType,
    subjectId: string,
    limitBytes: string,
  ): Promise<StorageQuota> {
    const row = await this.prisma.storageQuota.upsert({
      where: { subjectType_subjectId: { subjectType, subjectId } },
      create: {
        subjectType,
        subjectId,
        limitBytes: BigInt(limitBytes),
      },
      update: { limitBytes: BigInt(limitBytes) },
    });
    return toDomain(row);
  }

  async tryReserve(
    subjectType: QuotaSubjectType,
    subjectId: string,
    deltaBytes: string,
  ): Promise<StorageQuota | null> {
    const rows = await this.prisma.$queryRaw<StorageQuotaRow[]>`
      UPDATE "StorageQuota"
      SET "usedBytes" = "usedBytes" + ${BigInt(deltaBytes)},
          "updatedAt" = now()
      WHERE "subjectType" = ${subjectType}::"QuotaSubjectType"
        AND "subjectId" = ${subjectId}
        AND "usedBytes" + ${BigInt(deltaBytes)} <= "limitBytes"
      RETURNING *
    `;
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async release(
    subjectType: QuotaSubjectType,
    subjectId: string,
    deltaBytes: string,
  ): Promise<StorageQuota> {
    const rows = await this.prisma.$queryRaw<StorageQuotaRow[]>`
      UPDATE "StorageQuota"
      SET "usedBytes" = GREATEST("usedBytes" - ${BigInt(deltaBytes)}, 0),
          "updatedAt" = now()
      WHERE "subjectType" = ${subjectType}::"QuotaSubjectType"
        AND "subjectId" = ${subjectId}
      RETURNING *
    `;
    const row = rows[0];
    if (!row) {
      throw new Error(
        `Cannot release quota for unknown subject ${subjectType}:${subjectId}`,
      );
    }
    return toDomain(row);
  }

  async updateLastNotifiedThreshold(
    subjectType: QuotaSubjectType,
    subjectId: string,
    threshold: number,
  ): Promise<void> {
    await this.prisma.storageQuota.update({
      where: { subjectType_subjectId: { subjectType, subjectId } },
      data: { lastNotifiedThreshold: threshold },
    });
  }

  async getBreakdownBySubject(
    subjectType: QuotaSubjectType,
    subjectId: string,
  ): Promise<StorageBreakdownEntry[]> {
    const rows = await this.prisma.storageObject.groupBy({
      by: ['contentType'],
      where: {
        quotaSubjectType: subjectType,
        quotaSubjectId: subjectId,
        uploadStatus: { in: [...LIVE_UPLOAD_STATUSES] },
      },
      _sum: { size: true },
    });
    return rows.map((row) => ({
      contentType: row.contentType,
      totalBytes: (row._sum.size ?? 0n).toString(),
    }));
  }
}
