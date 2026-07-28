import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Notification as PrismaNotification,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Notification } from '../domain/notification.entity';
import {
  CreateNotificationParams,
  ListNotificationsParams,
  NotificationRepository,
} from '../domain/notification.repository';

function toDomain(row: PrismaNotification): Notification {
  return {
    id: row.id,
    recipientId: row.recipientId,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateNotificationParams): Promise<Notification> {
    const row = await this.prisma.notification.create({
      data: {
        recipientId: params.recipientId,
        type: params.type,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
    return toDomain(row);
  }

  async list(params: ListNotificationsParams): Promise<Notification[]> {
    const { recipientId, unreadOnly, cursor, limit } = params;

    const rows = await this.prisma.notification.findMany({
      where: {
        recipientId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map(toDomain);
  }

  countUnread(recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId, readAt: null },
    });
  }

  async markRead(
    id: string,
    recipientId: string,
  ): Promise<Notification | null> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const existing = await this.prisma.notification.findFirst({
        where: { id, recipientId },
      });
      return existing ? toDomain(existing) : null;
    }
    const row = await this.prisma.notification.findUniqueOrThrow({
      where: { id },
    });
    return toDomain(row);
  }

  async markAllRead(recipientId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
