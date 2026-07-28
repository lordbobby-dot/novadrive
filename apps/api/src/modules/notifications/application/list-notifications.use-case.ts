import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type { Notification } from '../domain/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from '../domain/notification.repository';

export interface ListNotificationsParams {
  recipientId: string;
  unreadOnly?: boolean;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(
    params: ListNotificationsParams,
  ): Promise<CursorPage<Notification>> {
    const rows = await this.notifications.list(params);
    return buildCursorPage(rows, params.limit);
  }
}
