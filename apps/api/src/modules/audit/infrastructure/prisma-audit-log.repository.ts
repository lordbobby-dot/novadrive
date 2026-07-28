import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog as PrismaAuditLog } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditLog } from '../domain/audit-log.entity';
import {
  AuditLogRepository,
  CreateAuditLogParams,
  ListAuditLogParams,
} from '../domain/audit-log.repository';

function toDomain(row: PrismaAuditLog): AuditLog {
  return {
    id: row.id,
    actorId: row.actorId,
    eventType: row.eventType,
    outcome: row.outcome,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata as Record<string, unknown> | null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateAuditLogParams): Promise<AuditLog> {
    const row = await this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        eventType: params.eventType,
        outcome: params.outcome,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
    return toDomain(row);
  }

  async list(params: ListAuditLogParams): Promise<AuditLog[]> {
    const { actorId, eventType, targetType, cursor, limit } = params;

    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(actorId ? { actorId } : {}),
        ...(eventType ? { eventType } : {}),
        ...(targetType ? { targetType } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map(toDomain);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }
}
