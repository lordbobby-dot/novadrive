import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SetSystemAdminUseCase } from './set-system-admin.use-case';
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

describe('SetSystemAdminUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: SetSystemAdminUseCase;

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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new SetSystemAdminUseCase(users, events);
  });

  it('refuses to let an admin revoke their own admin role', async () => {
    await expect(
      useCase.execute('admin-1', 'admin-1', false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.setSystemAdmin).not.toHaveBeenCalled();
  });

  it('allows an admin to grant themselves the role redundantly (no-op, not blocked)', async () => {
    const alreadyAdmin = makeUser({ id: 'admin-1', isSystemAdmin: true });
    users.findById.mockResolvedValue(alreadyAdmin);

    const result = await useCase.execute('admin-1', 'admin-1', true);

    expect(result).toBe(alreadyAdmin);
    expect(users.setSystemAdmin).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown target user', async () => {
    users.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'target-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent when the role already matches', async () => {
    const target = makeUser({ isSystemAdmin: true });
    users.findById.mockResolvedValue(target);

    const result = await useCase.execute('admin-1', 'target-1', true);

    expect(result).toBe(target);
    expect(users.setSystemAdmin).not.toHaveBeenCalled();
  });

  it('grants the role and audits ADMIN_ROLE_GRANTED', async () => {
    const target = makeUser({ isSystemAdmin: false });
    const promoted = makeUser({ isSystemAdmin: true });
    users.findById.mockResolvedValue(target);
    users.setSystemAdmin.mockResolvedValue(promoted);

    const result = await useCase.execute('admin-1', 'target-1', true);

    expect(users.setSystemAdmin).toHaveBeenCalledWith('target-1', true);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ADMIN_ROLE_GRANTED',
        actorId: 'admin-1',
        targetId: 'target-1',
      }),
    );
    expect(result).toBe(promoted);
  });

  it('revokes the role (for a different user) and audits ADMIN_ROLE_REVOKED', async () => {
    const target = makeUser({ isSystemAdmin: true });
    const demoted = makeUser({ isSystemAdmin: false });
    users.findById.mockResolvedValue(target);
    users.setSystemAdmin.mockResolvedValue(demoted);

    const result = await useCase.execute('admin-1', 'target-1', false);

    expect(users.setSystemAdmin).toHaveBeenCalledWith('target-1', false);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'ADMIN_ROLE_REVOKED' }),
    );
    expect(result).toBe(demoted);
  });
});
