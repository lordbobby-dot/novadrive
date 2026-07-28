import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Folder } from '../domain/folder.entity';
import {
  FindChildrenParams,
  FolderRepository,
  MoveFolderParams,
} from '../domain/folder.repository';

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PrismaFolderRepository implements FolderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, ownerId: string): Promise<Folder | null> {
    return this.prisma.folder.findFirst({ where: { id, ownerId } });
  }

  findByIdUnscoped(id: string): Promise<Folder | null> {
    return this.prisma.folder.findUnique({ where: { id } });
  }

  findByIds(ids: string[], ownerId: string): Promise<Folder[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.folder.findMany({ where: { id: { in: ids }, ownerId } });
  }

  findRoot(ownerId: string): Promise<Folder | null> {
    return this.prisma.folder.findFirst({ where: { ownerId, parentId: null } });
  }

  async createRoot(ownerId: string): Promise<Folder> {
    try {
      return await this.prisma.folder.create({
        data: {
          ownerId,
          name: 'My Drive',
          parentId: null,
          path: '/',
          depth: 0,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.findRoot(ownerId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  create(params: {
    ownerId: string;
    parentId: string;
    name: string;
    path: string;
    depth: number;
    organizationId?: string | null;
    workspaceId?: string | null;
  }): Promise<Folder> {
    return this.prisma.folder.create({ data: params });
  }

  createWorkspaceRoot(params: {
    ownerId: string;
    organizationId: string;
    workspaceId: string;
    name: string;
  }): Promise<Folder> {
    return this.prisma.folder.create({
      data: {
        ownerId: params.ownerId,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        name: params.name,
        parentId: null,
        path: '/',
        depth: 0,
      },
    });
  }

  findWorkspaceRoot(workspaceId: string): Promise<Folder | null> {
    return this.prisma.folder.findFirst({
      where: { workspaceId, parentId: null },
    });
  }

  /** Ownership must already be verified by the caller (use cases fetch-and-check before renaming). */
  rename(id: string, _ownerId: string, name: string): Promise<Folder> {
    return this.prisma.folder.update({ where: { id }, data: { name } });
  }

  /** `ownerId` is deliberately not part of the WHERE — a folder's children may belong to a
   * different owner than the folder itself (a collaborator can create resources inside a shared
   * folder they don't own), and PermissionGuard has already authorized access to `parentId`
   * before this runs. `parentId` alone already scopes the query correctly. */
  findChildren(params: FindChildrenParams): Promise<Folder[]> {
    const { parentId, cursor, limit } = params;
    return this.prisma.folder.findMany({
      // trash: null excludes soft-deleted folders — their row still exists (Trash only marks
      // it), so every listing query has to filter it out explicitly.
      where: { parentId, trash: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  /** Unscoped by owner for the same reason as `findChildren` — the path prefix already embeds
   * `folderId`, a globally unique id, so `path LIKE prefix%` can't cross into another owner's
   * unrelated subtree even without an ownerId filter. */
  async findDescendantIds(
    folderId: string,
    _ownerId: string,
  ): Promise<string[]> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: { path: true },
    });
    if (!folder) return [];

    const prefix = `${folder.path}${folderId}/`;
    const rows = await this.prisma.folder.findMany({
      where: { path: { startsWith: prefix } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** `ownerId` in `MoveFolderParams` is unused here — ownership never changes on move (a moved
   * folder and its subtree keep whichever owners they already had), and the lookup/update below
   * are unscoped since PermissionGuard already authorized `id`. */
  async move(params: MoveFolderParams): Promise<Folder> {
    const { id, newParentId, newPath, newDepth } = params;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.folder.findUnique({ where: { id } });
      if (!current) {
        throw new Error(`Folder ${id} not found during move`);
      }

      const oldPrefix = `${current.path}${current.id}/`;
      const newPrefix = `${newPath}${id}/`;
      const depthDelta = newDepth - current.depth;

      const updated = await tx.folder.update({
        where: { id },
        data: { parentId: newParentId, path: newPath, depth: newDepth },
      });

      // Re-prefix every descendant's path/depth in a single statement — cost is independent of
      // subtree size (one indexed scan + update), not one round trip per descendant. Matching by
      // path prefix alone (no ownerId) is safe for the same reason as findDescendantIds.
      if (oldPrefix !== newPrefix || depthDelta !== 0) {
        await tx.$executeRaw`
          UPDATE "Folder"
          SET "path" = ${newPrefix} || substring("path" from ${oldPrefix.length + 1}::int),
              "depth" = "depth" + ${depthDelta}
          WHERE "path" LIKE ${oldPrefix + '%'}
        `;
      }

      return updated;
    });
  }

  async softDeleteSubtree(
    folderId: string,
    ownerId: string,
  ): Promise<string[]> {
    const descendantIds = await this.findDescendantIds(folderId, ownerId);
    const allIds = [folderId, ...descendantIds];

    // skipDuplicates makes this idempotent (re-deleting an already-trashed folder is a no-op,
    // not an error) and lets 1000+ rows go through one batched INSERT rather than one per folder.
    await this.prisma.trash.createMany({
      data: allIds.map((trashedFolderId) => ({
        ownerId,
        folderId: trashedFolderId,
      })),
      skipDuplicates: true,
    });

    return allIds;
  }

  async isTrashed(id: string): Promise<boolean> {
    const trash = await this.prisma.trash.findUnique({
      where: { folderId: id },
      select: { id: true },
    });
    return trash !== null;
  }

  async restoreSubtree(folderId: string, ownerId: string): Promise<string[]> {
    const descendantIds = await this.findDescendantIds(folderId, ownerId);
    const allIds = [folderId, ...descendantIds];

    await this.prisma.trash.deleteMany({
      where: { ownerId, folderId: { in: allIds } },
    });

    return allIds;
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.folder.delete({ where: { id } });
  }
}
