import { MarkAllNotificationsReadUseCase } from './mark-all-notifications-read.use-case';
import type { NotificationRepository } from '../domain/notification.repository';

describe('MarkAllNotificationsReadUseCase', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let useCase: MarkAllNotificationsReadUseCase;

  beforeEach(() => {
    notifications = {
      create: jest.fn(),
      list: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    useCase = new MarkAllNotificationsReadUseCase(notifications);
  });

  it('delegates to the repository and returns the number of rows updated', async () => {
    notifications.markAllRead.mockResolvedValue(5);

    const count = await useCase.execute('user-1');

    expect(notifications.markAllRead).toHaveBeenCalledWith('user-1');
    expect(count).toBe(5);
  });
});
