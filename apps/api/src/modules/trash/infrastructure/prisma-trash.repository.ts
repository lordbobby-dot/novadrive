import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  ExpiredTrashRoot,
  StorageObjectLocation,
  TrashItemType,
  TrashListItem,
} from '../domain/trash.entity';
import { ListTrashParams, TrashRepository } from '../domain/trash.repository';

interface RawTrashRow {
  type: TrashItemType;
  id: string;
  name: string;
  trashId: string;
  deletedAt: Date;
}

interface RawExpiredRow {
  type: TrashItemType;
  id: string;
  ownerId: string;
}

/** A trashed folder counts as a "root" only if its parent isn't also trashed; a trashed file
 * counts as a root only if its containing folder isn't also trashed — reused by both the listing
 * query and the expiry sweep so "what shows up in Trash" and "what the cleanup job purges" never
 * disagree about what counts as a top-level entry. */
const FOLDER_ROOT_CONDITION = Prisma.sql`
  (f."parentId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "Trash" pt WHERE pt."folderId" = f."parentId"
  ))
`;
const FILE_ROOT_CONDITION = Prisma.sql`
  NOT EXISTS (SELECT 1 FROM "Trash" pt WHERE pt."folderId" = fi."folderId")
`;

@Injectable()
export class PrismaTrashRepository implements TrashRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRoots(params: ListTrashParams): Promise<TrashListItem[]> {
    const { ownerId, cursor, limit } = params;
    const offset = cursor ? Number(cursor) : 0;

    const rows = await this.prisma.$queryRaw<RawTrashRow[]>`
      SELECT * FROM (
        (
          SELECT 'folder' AS type, f.id, f.name, t.id AS "trashId", t."deletedAt"
          FROM "Folder" f
          JOIN "Trash" t ON t."folderId" = f.id
          WHERE f."ownerId" = ${ownerId} AND ${FOLDER_ROOT_CONDITION}
        )
        UNION ALL
        (
          SELECT 'file' AS type, fi.id, fi.name, t.id AS "trashId", t."deletedAt"
          FROM "File" fi
          JOIN "Trash" t ON t."fileId" = fi.id
          WHERE fi."ownerId" = ${ownerId} AND ${FILE_ROOT_CONDITION}
        )
      ) AS combined
      ORDER BY "deletedAt" DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;
    return rows.map((row) => ({
      trashId: row.trashId,
      type: row.type,
      id: row.id,
      name: row.name,
      deletedAt: row.deletedAt,
    }));
  }

  async findById(
    trashId: string,
    ownerId: string,
  ): Promise<{ type: TrashItemType; id: string } | null> {
    const row = await this.prisma.trash.findFirst({
      where: { id: trashId, ownerId },
    });
    if (!row) return null;
    if (row.folderId) return { type: 'folder', id: row.folderId };
    if (row.fileId) return { type: 'file', id: row.fileId };
    return null;
  }

  async findExpiredRoots(cutoff: Date): Promise<ExpiredTrashRoot[]> {
    const rows = await this.prisma.$queryRaw<RawExpiredRow[]>`
      (
        SELECT 'folder' AS type, f.id, f."ownerId"
        FROM "Folder" f
        JOIN "Trash" t ON t."folderId" = f.id
        WHERE t."deletedAt" < ${cutoff} AND ${FOLDER_ROOT_CONDITION}
      )
      UNION ALL
      (
        SELECT 'file' AS type, fi.id, fi."ownerId"
        FROM "File" fi
        JOIN "Trash" t ON t."fileId" = fi.id
        WHERE t."deletedAt" < ${cutoff} AND ${FILE_ROOT_CONDITION}
      )
    `;
    return rows;
  }

  async getStorageObjectLocations(
    ids: string[],
  ): Promise<StorageObjectLocation[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.storageObject.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        size: true,
        quotaSubjectType: true,
        quotaSubjectId: true,
      },
    });
    return rows.map((row) => ({ ...row, size: row.size.toString() }));
  }

  async deleteStorageObjects(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.storageObject.deleteMany({ where: { id: { in: ids } } });
  }
}
