import { NotFoundException } from '@nestjs/common';
import { MarkNotificationReadUseCase } from './mark-notification-read.use-case';
import type { Notification } from '../domain/notification.entity';
import type { NotificationRepository } from '../domain/notification.repository';

describe('MarkNotificationReadUseCase', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let useCase: MarkNotificationReadUseCase;

  const notification: Notification = {
    id: 'notification-1',
    recipientId: 'user-1',
    type: 'COMMENT',
    payload: {},
    readAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(() => {
    notifications = {
      create: jest.fn(),
      list: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    useCase = new MarkNotificationReadUseCase(notifications);
  });

  it('marks the notification read when it belongs to the recipient', async () => {
    notifications.markRead.mockResolvedValue(notification);

    const result = await useCase.execute({
      recipientId: 'user-1',
      notificationId: 'notification-1',
    });

    expect(notifications.markRead).toHaveBeenCalledWith(
      'notification-1',
      'user-1',
    );
    expect(result).toEqual(notification);
  });

  it('throws NotFoundException when the notification does not exist or belongs to someone else', async () => {
    notifications.markRead.mockResolvedValue(null);

    await expect(
      useCase.execute({ recipientId: 'user-1', notificationId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
