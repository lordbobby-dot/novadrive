import { ListAdminUsersUseCase } from './list-admin-users.use-case';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';
import type { StorageQuotaRepository } from '../../quota/domain/storage-quota.repository';

function makeUser(id: string): User {
  return {
    id,
    clerkId: `clerk-${id}`,
    email: `${id}@example.com`,
    name: null,
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ListAdminUsersUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let useCase: ListAdminUsersUseCase;

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
      findManyBySubjects: jest.fn().mockResolvedValue([]),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn(),
    };
    useCase = new ListAdminUsersUseCase(users, quotas);
  });

  it('passes params through and paginates via the lookahead-row cursor pattern', async () => {
    users.list.mockResolvedValue([makeUser('1'), makeUser('2'), makeUser('3')]);

    const page = await useCase.execute({ search: 'ex', limit: 2 });

    expect(users.list).toHaveBeenCalledWith({ search: 'ex', limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('2');
  });

  it('reports no next cursor when fewer rows than the lookahead limit come back', async () => {
    users.list.mockResolvedValue([makeUser('1')]);
    const page = await useCase.execute({ limit: 20 });
    expect(page.nextCursor).toBeNull();
  });

  it('reports null storageLimitBytes and zero usage for a user with no StorageQuota row yet', async () => {
    users.list.mockResolvedValue([makeUser('1')]);
    const page = await useCase.execute({ limit: 20 });
    expect(page.items[0].storageUsedBytes).toBe('0');
    expect(page.items[0].storageLimitBytes).toBeNull();
  });

  it('attaches each returned user their own batched quota row, keyed by subjectId', async () => {
    users.list.mockResolvedValue([makeUser('1'), makeUser('2')]);
    quotas.findManyBySubjects.mockResolvedValue([
      {
        id: 'q1',
        subjectType: 'USER',
        subjectId: '1',
        limitBytes: '5000',
        usedBytes: '1234',
        lastNotifiedThreshold: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const page = await useCase.execute({ limit: 20 });

    expect(quotas.findManyBySubjects).toHaveBeenCalledWith('USER', ['1', '2']);
    expect(page.items[0]).toMatchObject({
      storageUsedBytes: '1234',
      storageLimitBytes: '5000',
    });
    expect(page.items[1]).toMatchObject({
      storageUsedBytes: '0',
      storageLimitBytes: null,
    });
  });
});
