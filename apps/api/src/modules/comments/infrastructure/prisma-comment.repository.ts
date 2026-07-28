import { Injectable } from '@nestjs/common';
import type { Comment as PrismaComment } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import type { Comment } from '../domain/comment.entity';
import {
  CreateCommentParams,
  CommentRepository,
} from '../domain/comment.repository';

function toDomain(row: PrismaComment): Comment {
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    authorId: row.authorId,
    body: row.body,
    resolved: row.resolved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateCommentParams): Promise<Comment> {
    const row = await this.prisma.comment.create({ data: params });
    return toDomain(row);
  }

  async findById(id: string): Promise<Comment | null> {
    const row = await this.prisma.comment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Comment[]> {
    const rows = await this.prisma.comment.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async setResolved(id: string, resolved: boolean): Promise<Comment> {
    const row = await this.prisma.comment.update({
      where: { id },
      data: { resolved },
    });
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.comment.delete({ where: { id } });
  }
}
