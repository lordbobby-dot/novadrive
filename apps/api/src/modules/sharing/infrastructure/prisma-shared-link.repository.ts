import { Injectable } from '@nestjs/common';
import { Prisma, type SharedLink as PrismaSharedLink } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ResourceTypeName } from '../domain/permission.entity';
import type { SharedLink } from '../domain/shared-link.entity';
import {
  CreateSharedLinkParams,
  SharedLinkRepository,
} from '../domain/shared-link.repository';

function toDomain(row: PrismaSharedLink): SharedLink {
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    token: row.token,
    ownerId: row.ownerId,
    passwordHash: row.passwordHash,
    expiresAt: row.expiresAt,
    maxDownloads: row.maxDownloads,
    downloadCount: row.downloadCount,
    canView: row.canView,
    canDownload: row.canDownload,
    canComment: row.canComment,
    canEdit: row.canEdit,
    visibility: row.visibility,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaSharedLinkRepository implements SharedLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateSharedLinkParams): Promise<SharedLink> {
    const row = await this.prisma.sharedLink.create({ data: params });
    return toDomain(row);
  }

  async findById(id: string): Promise<SharedLink | null> {
    const row = await this.prisma.sharedLink.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByToken(token: string): Promise<SharedLink | null> {
    const row = await this.prisma.sharedLink.findUnique({ where: { token } });
    return row ? toDomain(row) : null;
  }

  async listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<SharedLink[]> {
    const rows = await this.prisma.sharedLink.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.sharedLink.delete({ where: { id } });
  }

  async incrementDownloadCountIfUnderLimit(
    id: string,
  ): Promise<SharedLink | null> {
    const rows = await this.prisma.$queryRaw<PrismaSharedLink[]>(Prisma.sql`
      UPDATE "SharedLink"
      SET "downloadCount" = "downloadCount" + 1
      WHERE id = ${id} AND ("maxDownloads" IS NULL OR "downloadCount" < "maxDownloads")
      RETURNING *
    `);
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
