import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Notification } from '../domain/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from '../domain/notification.repository';

export interface MarkNotificationReadParams {
  recipientId: string;
  notificationId: string;
}

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(params: MarkNotificationReadParams): Promise<Notification> {
    const notification = await this.notifications.markRead(
      params.notificationId,
      params.recipientId,
    );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }
}
