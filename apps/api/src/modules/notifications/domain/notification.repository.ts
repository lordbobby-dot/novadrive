import type { Notification, NotificationType } from './notification.entity';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}

export interface ListNotificationsParams {
  recipientId: string;
  unreadOnly?: boolean;
  cursor?: string;
  limit: number;
}

export interface NotificationRepository {
  create(params: CreateNotificationParams): Promise<Notification>;
  /** Returns up to `limit + 1` rows (caller derives the next cursor from the lookahead row). */
  list(params: ListNotificationsParams): Promise<Notification[]>;
  countUnread(recipientId: string): Promise<number>;
  /** Returns null if no notification with this id belongs to recipientId. */
  markRead(id: string, recipientId: string): Promise<Notification | null>;
  /** Returns the number of rows marked read. */
  markAllRead(recipientId: string): Promise<number>;
}
