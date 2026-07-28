import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { UnsuspendUserUseCase } from './unsuspend-user.use-case';
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
    isSuspended: true,
    suspendedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UnsuspendUserUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let clerkClient: { users: { banUser: jest.Mock; unbanUser: jest.Mock } };
  let events: jest.Mocked<EventEmitter2>;
  let useCase: UnsuspendUserUseCase;

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
    useCase = new UnsuspendUserUseCase(users, clerkClient as never, events);
  });

  it('throws NotFoundException for an unknown target user', async () => {
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute('admin-1', 'target-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is idempotent — unsuspending a non-suspended user is a no-op', async () => {
    const notSuspended = makeUser({ isSuspended: false, suspendedAt: null });
    users.findById.mockResolvedValue(notSuspended);

    const result = await useCase.execute('admin-1', 'target-1');

    expect(result).toBe(notSuspended);
    expect(clerkClient.users.unbanUser).not.toHaveBeenCalled();
  });

  it('unbans the user in Clerk, clears suspension locally, and audits the action', async () => {
    const target = makeUser();
    const reinstated = makeUser({ isSuspended: false, suspendedAt: null });
    users.findById.mockResolvedValue(target);
    users.setSuspended.mockResolvedValue(reinstated);

    const result = await useCase.execute('admin-1', 'target-1');

    expect(clerkClient.users.unbanUser).toHaveBeenCalledWith('clerk-target-1');
    expect(users.setSuspended).toHaveBeenCalledWith('target-1', false);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'USER_UNSUSPENDED',
        outcome: 'SUCCESS',
        actorId: 'admin-1',
        targetId: 'target-1',
      }),
    );
    expect(result).toBe(reinstated);
  });
});
