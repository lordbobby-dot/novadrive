import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  SearchResultItem,
  SearchResultPage,
} from '../domain/search-result.entity';
import {
  FavoritesQuery,
  RecentQuery,
  SearchQuery,
  SearchService,
} from '../domain/search.service';

interface RawSearchRow {
  type: 'file' | 'folder';
  id: string;
  name: string;
  parentOrFolderId: string | null;
  contentType: string | null;
  size: string | null;
  createdAt: Date;
  updatedAt: Date;
  rank: number;
}

/**
 * Relevance ranking isn't a stable, monotonic sort key the way `id` is, so this uses
 * offset-based pagination (the cursor is just the next offset, encoded as a string) rather than
 * the keyset cursor pagination the rest of the app uses — see docs/search.md for why that's a
 * deliberate tradeoff here, not an inconsistency. Recent/Favorites reuse the same offset scheme
 * for consistency even though their own ordering (lastAccessedAt / favorite.createdAt) actually
 * is stable — one pagination story for the whole module is simpler than two.
 */
@Injectable()
export class PostgresSearchService implements SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQuery): Promise<SearchResultPage> {
    const {
      ownerId,
      q,
      type,
      dateFrom,
      dateTo,
      tag,
      workspaceId,
      owner,
      folderId,
      cursor,
      limit,
    } = query;
    const offset = cursor ? Number(cursor) : 0;

    // plainto_tsquery tolerates arbitrary user input (punctuation, stray operators) without
    // throwing, unlike to_tsquery which expects tsquery operator syntax.
    const tsQuery = Prisma.sql`plainto_tsquery('english', ${q})`;
    const scope = { ownerId, workspaceId, owner, folderId };

    const parts: Prisma.Sql[] = [];
    if (type !== 'folder') {
      parts.push(this.buildFileSelect(scope, tsQuery, dateFrom, dateTo, tag));
    }
    if (type !== 'file') {
      parts.push(this.buildFolderSelect(scope, tsQuery, dateFrom, dateTo, tag));
    }

    const rows = await this.prisma.$queryRaw<RawSearchRow[]>`
      SELECT * FROM (${Prisma.join(parts, ' UNION ALL ')}) AS combined
      ORDER BY rank DESC, "createdAt" DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    return toPage(rows, limit, offset);
  }

  async listRecent(query: RecentQuery): Promise<SearchResultPage> {
    const { ownerId, workspaceId, cursor, limit } = query;
    const offset = cursor ? Number(cursor) : 0;

    const scopeCondition = workspaceId
      ? Prisma.sql`EXISTS (SELECT 1 FROM "Folder" wf WHERE wf.id = f."folderId" AND wf."workspaceId" = ${workspaceId})`
      : Prisma.sql`f."ownerId" = ${ownerId}`;

    const rows = await this.prisma.$queryRaw<RawSearchRow[]>`
      SELECT
        'file' AS type, f.id, f.name, f."folderId" AS "parentOrFolderId",
        so."contentType", so.size::text AS size, f."createdAt", f."updatedAt",
        0 AS rank
      FROM "File" f
      JOIN "StorageObject" so ON so.id = f."storageObjectId"
      WHERE ${scopeCondition}
        AND f."lastAccessedAt" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."fileId" = f.id)
      ORDER BY f."lastAccessedAt" DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    return toPage(rows, limit, offset);
  }

  async listFavorites(query: FavoritesQuery): Promise<SearchResultPage> {
    const { ownerId, cursor, limit } = query;
    const offset = cursor ? Number(cursor) : 0;

    const rows = await this.prisma.$queryRaw<RawSearchRow[]>`
      SELECT * FROM (
        SELECT
          'file' AS type, f.id, f.name, f."folderId" AS "parentOrFolderId",
          so."contentType", so.size::text AS size, f."createdAt", f."updatedAt",
          0 AS rank, fav."createdAt" AS "favoritedAt"
        FROM "Favorite" fav
        JOIN "File" f ON f.id = fav."fileId"
        JOIN "StorageObject" so ON so.id = f."storageObjectId"
        WHERE fav."ownerId" = ${ownerId}
          AND NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."fileId" = f.id)

        UNION ALL

        SELECT
          'folder' AS type, fo.id, fo.name, fo."parentId" AS "parentOrFolderId",
          NULL AS "contentType", NULL AS size, fo."createdAt", fo."updatedAt",
          0 AS rank, fav."createdAt" AS "favoritedAt"
        FROM "Favorite" fav
        JOIN "Folder" fo ON fo.id = fav."folderId"
        WHERE fav."ownerId" = ${ownerId}
          AND NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."folderId" = fo.id)
      ) AS combined
      ORDER BY "favoritedAt" DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    return toPage(rows, limit, offset);
  }

  private buildFileSelect(
    scope: {
      ownerId: string;
      workspaceId?: string;
      owner?: string;
      folderId?: string;
    },
    tsQuery: Prisma.Sql,
    dateFrom: Date | undefined,
    dateTo: Date | undefined,
    tag: string | undefined,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      scope.workspaceId
        ? Prisma.sql`EXISTS (SELECT 1 FROM "Folder" wf WHERE wf.id = f."folderId" AND wf."workspaceId" = ${scope.workspaceId})`
        : Prisma.sql`f."ownerId" = ${scope.ownerId}`,
      Prisma.sql`f."searchVector" @@ ${tsQuery}`,
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."fileId" = f.id)`,
    ];
    if (scope.owner) conditions.push(Prisma.sql`f."ownerId" = ${scope.owner}`);
    if (scope.folderId) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "Folder" ff
        WHERE ff.id = f."folderId"
          AND (ff.id = ${scope.folderId}
            OR ff.path LIKE (SELECT path || id || '/' FROM "Folder" WHERE id = ${scope.folderId}) || '%')
      )`);
    }
    if (dateFrom) conditions.push(Prisma.sql`f."createdAt" >= ${dateFrom}`);
    if (dateTo) conditions.push(Prisma.sql`f."createdAt" <= ${dateTo}`);
    if (tag) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "FileTag" ft JOIN "Tag" tg ON tg.id = ft."tagId"
        WHERE ft."fileId" = f.id AND tg."ownerId" = ${scope.ownerId} AND tg.name = ${tag}
      )`);
    }

    return Prisma.sql`
      SELECT
        'file' AS type, f.id, f.name, f."folderId" AS "parentOrFolderId",
        so."contentType", so.size::text AS size, f."createdAt", f."updatedAt",
        ts_rank(f."searchVector", ${tsQuery}, 1) AS rank
      FROM "File" f
      JOIN "StorageObject" so ON so.id = f."storageObjectId"
      WHERE ${Prisma.join(conditions, ' AND ')}
    `;
  }

  private buildFolderSelect(
    scope: {
      ownerId: string;
      workspaceId?: string;
      owner?: string;
      folderId?: string;
    },
    tsQuery: Prisma.Sql,
    dateFrom: Date | undefined,
    dateTo: Date | undefined,
    tag: string | undefined,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      scope.workspaceId
        ? Prisma.sql`fo."workspaceId" = ${scope.workspaceId}`
        : Prisma.sql`fo."ownerId" = ${scope.ownerId}`,
      Prisma.sql`fo."searchVector" @@ ${tsQuery}`,
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "Trash" t WHERE t."folderId" = fo.id)`,
    ];
    if (scope.owner) conditions.push(Prisma.sql`fo."ownerId" = ${scope.owner}`);
    if (scope.folderId) {
      conditions.push(Prisma.sql`(
        fo.id = ${scope.folderId}
        OR fo.path LIKE (SELECT path || id || '/' FROM "Folder" WHERE id = ${scope.folderId}) || '%'
      )`);
    }
    if (dateFrom) conditions.push(Prisma.sql`fo."createdAt" >= ${dateFrom}`);
    if (dateTo) conditions.push(Prisma.sql`fo."createdAt" <= ${dateTo}`);
    if (tag) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "FolderTag" ft JOIN "Tag" tg ON tg.id = ft."tagId"
        WHERE ft."folderId" = fo.id AND tg."ownerId" = ${scope.ownerId} AND tg.name = ${tag}
      )`);
    }

    return Prisma.sql`
      SELECT
        'folder' AS type, fo.id, fo.name, fo."parentId" AS "parentOrFolderId",
        NULL AS "contentType", NULL AS size, fo."createdAt", fo."updatedAt",
        ts_rank(fo."searchVector", ${tsQuery}, 1) AS rank
      FROM "Folder" fo
      WHERE ${Prisma.join(conditions, ' AND ')}
    `;
  }
}

function toPage(
  rows: RawSearchRow[],
  limit: number,
  offset: number,
): SearchResultPage {
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDomain);
  const nextCursor = hasMore ? String(offset + limit) : null;
  return { items, nextCursor };
}

function toDomain(row: RawSearchRow): SearchResultItem {
  return {
    type: row.type,
    id: row.id,
    name: row.name,
    parentOrFolderId: row.parentOrFolderId,
    contentType: row.contentType,
    size: row.size,
    rank: row.rank,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
