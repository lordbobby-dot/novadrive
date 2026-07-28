import { GetUnreadCountUseCase } from './get-unread-count.use-case';
import type { NotificationRepository } from '../domain/notification.repository';

describe('GetUnreadCountUseCase', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let useCase: GetUnreadCountUseCase;

  beforeEach(() => {
    notifications = {
      create: jest.fn(),
      list: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    useCase = new GetUnreadCountUseCase(notifications);
  });

  it('delegates to the repository for the recipient', async () => {
    notifications.countUnread.mockResolvedValue(3);

    const count = await useCase.execute('user-1');

    expect(notifications.countUnread).toHaveBeenCalledWith('user-1');
    expect(count).toBe(3);
  });
});
