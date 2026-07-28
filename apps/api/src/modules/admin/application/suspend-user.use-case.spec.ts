import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SuspendUserUseCase } from './suspend-user.use-case';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'target-1',
    clerkId: 'clerk-target-1',
    email: 'target@example.com',
    name: null,
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SuspendUserUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let clerkClient: { users: { banUser: jest.Mock; unbanUser: jest.Mock } };
  let events: jest.Mocked<EventEmitter2>;
  let useCase: SuspendUserUseCase;

  beforeEach(() => {
    users = {
      findByClerkId: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByIds: jest.fn(),
      upsertFromClerk: jest.fn(),
      deleteByClerkId: jest.fn(),
      list: jest.fn(),
      setSystemAdmin: jest.fn(),
      setSuspended: jest.fn(),
    };
    clerkClient = { users: { banUser: jest.fn(), unbanUser: jest.fn() } };
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new SuspendUserUseCase(users, clerkClient as never, events);
  });

  it('refuses to let an admin suspend their own account', async () => {
    await expect(useCase.execute('admin-1', 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(clerkClient.users.banUser).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown target user', async () => {
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute('admin-1', 'target-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is idempotent — suspending an already-suspended user is a no-op', async () => {
    const alreadySuspended = makeUser({ isSuspended: true });
    users.findById.mockResolvedValue(alreadySuspended);

    const result = await useCase.execute('admin-1', 'target-1');

    expect(result).toBe(alreadySuspended);
    expect(clerkClient.users.banUser).not.toHaveBeenCalled();
    expect(users.setSuspended).not.toHaveBeenCalled();
  });

  it('bans the user in Clerk, marks them suspended locally, and audits the action', async () => {
    const target = makeUser();
    const suspended = makeUser({ isSuspended: true, suspendedAt: new Date() });
    users.findById.mockResolvedValue(target);
    users.setSuspended.mockResolvedValue(suspended);

    const result = await useCase.execute('admin-1', 'target-1');

    expect(clerkClient.users.banUser).toHaveBeenCalledWith('clerk-target-1');
    expect(users.setSuspended).toHaveBeenCalledWith('target-1', true);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'USER_SUSPENDED',
        outcome: 'SUCCESS',
        actorId: 'admin-1',
        targetType: 'USER',
        targetId: 'target-1',
      }),
    );
    expect(result).toBe(suspended);
  });
});
