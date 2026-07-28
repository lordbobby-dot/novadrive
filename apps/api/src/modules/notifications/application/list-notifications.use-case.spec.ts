import { ListNotificationsUseCase } from './list-notifications.use-case';
import type { Notification } from '../domain/notification.entity';
import type { NotificationRepository } from '../domain/notification.repository';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    recipientId: 'user-1',
    type: 'SHARE',
    payload: {},
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListNotificationsUseCase', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let useCase: ListNotificationsUseCase;

  beforeEach(() => {
    notifications = {
      create: jest.fn(),
      list: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    useCase = new ListNotificationsUseCase(notifications);
  });

  it('passes params through to the repository and paginates the result', async () => {
    notifications.list.mockResolvedValue([makeNotification()]);

    const page = await useCase.execute({
      recipientId: 'user-1',
      unreadOnly: true,
      limit: 20,
    });

    expect(notifications.list).toHaveBeenCalledWith({
      recipientId: 'user-1',
      unreadOnly: true,
      limit: 20,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('derives nextCursor from the lookahead row', async () => {
    notifications.list.mockResolvedValue([
      makeNotification({ id: 'n-1' }),
      makeNotification({ id: 'n-2' }),
    ]);

    const page = await useCase.execute({ recipientId: 'user-1', limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('n-1');
  });
});
