import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SetUserQuotaUseCase } from './set-user-quota.use-case';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';
import type { StorageQuotaRepository } from '../../quota/domain/storage-quota.repository';
import type { StorageQuota } from '../../quota/domain/storage-quota.entity';

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

function makeQuota(overrides: Partial<StorageQuota> = {}): StorageQuota {
  return {
    id: 'quota-1',
    subjectType: 'USER',
    subjectId: 'target-1',
    limitBytes: '5000000000',
    usedBytes: '0',
    lastNotifiedThreshold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SetUserQuotaUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: SetUserQuotaUseCase;

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
    quotas = {
      findBySubject: jest.fn(),
      findManyBySubjects: jest.fn(),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn(),
    };
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new SetUserQuotaUseCase(users, quotas, events);
  });

  it('rejects a zero limit', async () => {
    await expect(
      useCase.execute('admin-1', 'target-1', '0'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quotas.setLimit).not.toHaveBeenCalled();
  });

  it('rejects a negative limit', async () => {
    await expect(
      useCase.execute('admin-1', 'target-1', '-5'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quotas.setLimit).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown target user', async () => {
    users.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'target-1', '5000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(quotas.setLimit).not.toHaveBeenCalled();
  });

  it('sets the limit, audits USER_QUOTA_UPDATED, and returns the merged user+quota summary', async () => {
    const target = makeUser();
    const quota = makeQuota({ limitBytes: '5000000000', usedBytes: '123' });
    users.findById.mockResolvedValue(target);
    quotas.setLimit.mockResolvedValue(quota);

    const result = await useCase.execute('admin-1', 'target-1', '5000000000');

    expect(quotas.setLimit).toHaveBeenCalledWith(
      'USER',
      'target-1',
      '5000000000',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'USER_QUOTA_UPDATED',
        actorId: 'admin-1',
        targetId: 'target-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'target-1',
      storageUsedBytes: '123',
      storageLimitBytes: '5000000000',
    });
  });
});
