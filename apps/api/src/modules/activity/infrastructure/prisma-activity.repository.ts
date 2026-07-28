import { Injectable } from '@nestjs/common';
import { Prisma, type Activity as PrismaActivity } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Activity } from '../domain/activity.entity';
import {
  ActivityRepository,
  CreateActivityParams,
  ListActivityParams,
} from '../domain/activity.repository';

function toDomain(row: PrismaActivity): Activity {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata as Record<string, unknown> | null,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaActivityRepository implements ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateActivityParams): Promise<Activity> {
    const row = await this.prisma.activity.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress,
      },
    });
    return toDomain(row);
  }

  async list(params: ListActivityParams): Promise<Activity[]> {
    const {
      actorId,
      targetId,
      targetType,
      action,
      dateFrom,
      dateTo,
      cursor,
      limit,
    } = params;

    const rows = await this.prisma.activity.findMany({
      where: {
        actorId,
        ...(targetId ? { targetId } : {}),
        ...(targetType ? { targetType } : {}),
        ...(action ? { action } : {}),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map(toDomain);
  }
}
