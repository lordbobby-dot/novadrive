import { Injectable } from '@nestjs/common';
import type { Permission as PrismaPermission } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Permission, ResourceTypeName } from '../domain/permission.entity';
import { SharedWithMeRow } from '../domain/shared-with-me.entity';
import {
  CreatePermissionParams,
  PermissionRepository,
} from '../domain/permission.repository';

interface RawSharedWithMeRow {
  type: 'file' | 'folder';
  id: string;
  name: string;
  parentOrFolderId: string | null;
  contentType: string | null;
  size: string | null;
  role: SharedWithMeRow['role'];
  ownerId: string;
  grantedAt: Date;
}

function toDomain(row: PrismaPermission): Permission {
  return {
    id: row.id,
    subjectId: row.subjectId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    role: row.role,
    grantedBy: row.grantedBy,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaPermissionRepository implements PermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findExplicit(
    subjectId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Permission | null> {
    const row = await this.prisma.permission.findUnique({
      where: {
        subjectId_resourceType_resourceId: {
          subjectId,
          resourceType,
          resourceId,
        },
      },
    });
    return row ? toDomain(row) : null;
  }

  async findManyForSubject(
    subjectId: string,
    resourceType: ResourceTypeName,
    resourceIds: string[],
  ): Promise<Permission[]> {
    if (resourceIds.length === 0) return [];
    const rows = await this.prisma.permission.findMany({
      where: { subjectId, resourceType, resourceId: { in: resourceIds } },
    });
    return rows.map(toDomain);
  }

  async upsert(params: CreatePermissionParams): Promise<Permission> {
    const row = await this.prisma.permission.upsert({
      where: {
        subjectId_resourceType_resourceId: {
          subjectId: params.subjectId,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
        },
      },
      create: params,
      update: { role: params.role, grantedBy: params.grantedBy },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<Permission | null> {
    const row = await this.prisma.permission.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.permission.delete({ where: { id } });
  }

  async listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Permission[]> {
    const rows = await this.prisma.permission.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listGrantedToSubject(
    subjectId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ rows: SharedWithMeRow[]; nextCursor: string | null }> {
    const offset = cursor ? Number(cursor) : 0;

    const rows = await this.prisma.$queryRaw<RawSharedWithMeRow[]>`
      SELECT * FROM (
        SELECT
          'file' AS type, f.id, f.name, f."folderId" AS "parentOrFolderId",
          so."contentType", so.size::text AS size, p.role, f."ownerId",
          p."createdAt" AS "grantedAt"
        FROM "Permission" p
        JOIN "File" f ON f.id = p."resourceId" AND p."resourceType" = 'FILE'
        JOIN "StorageObject" so ON so.id = f."storageObjectId"
        WHERE p."subjectId" = ${subjectId}
          AND f."ownerId" != ${subjectId}
          AND NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."fileId" = f.id)

        UNION ALL

        SELECT
          'folder' AS type, fo.id, fo.name, fo."parentId" AS "parentOrFolderId",
          NULL AS "contentType", NULL AS size, p.role, fo."ownerId",
          p."createdAt" AS "grantedAt"
        FROM "Permission" p
        JOIN "Folder" fo ON fo.id = p."resourceId" AND p."resourceType" = 'FOLDER'
        WHERE p."subjectId" = ${subjectId}
          AND fo."ownerId" != ${subjectId}
          AND NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."folderId" = fo.id)
      ) AS combined
      ORDER BY "grantedAt" DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      rows: page,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }
}
