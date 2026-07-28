import { ConfigService } from '@nestjs/config';
import { SyncClerkUserUseCase } from './sync-clerk-user.use-case';
import type { EnvConfig } from '../../../config/env.validation';
import type { User } from '../domain/user.entity';
import type { UserRepository } from '../domain/user.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'local-1',
    clerkId: 'clerk-1',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SyncClerkUserUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let config: ConfigService<EnvConfig, true>;
  let useCase: SyncClerkUserUseCase;

  function makeConfig(
    bootstrapEmails: string[],
  ): ConfigService<EnvConfig, true> {
    return {
      get: jest.fn().mockReturnValue(bootstrapEmails),
    } as unknown as ConfigService<EnvConfig, true>;
  }

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
  });

  it('upserts and returns the user unchanged when the email is not in the bootstrap list', async () => {
    config = makeConfig(['someone-else@example.com']);
    useCase = new SyncClerkUserUseCase(users, config);
    const user = makeUser();
    users.upsertFromClerk.mockResolvedValue(user);

    const result = await useCase.execute({
      clerkId: 'clerk-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
    });

    expect(result).toBe(user);
    expect(users.setSystemAdmin).not.toHaveBeenCalled();
  });

  it('grants isSystemAdmin when the synced email matches the bootstrap list (case-insensitive)', async () => {
    config = makeConfig(['user@example.com']);
    useCase = new SyncClerkUserUseCase(users, config);
    const user = makeUser({ isSystemAdmin: false });
    const promoted = makeUser({ isSystemAdmin: true });
    users.upsertFromClerk.mockResolvedValue(user);
    users.setSystemAdmin.mockResolvedValue(promoted);

    const result = await useCase.execute({
      clerkId: 'clerk-1',
      email: 'USER@EXAMPLE.COM',
      name: 'Test User',
      avatarUrl: null,
    });

    expect(users.setSystemAdmin).toHaveBeenCalledWith('local-1', true);
    expect(result).toBe(promoted);
  });

  it('does not re-grant (or touch) an already-admin user even if their email matches the bootstrap list', async () => {
    config = makeConfig(['user@example.com']);
    useCase = new SyncClerkUserUseCase(users, config);
    const alreadyAdmin = makeUser({ isSystemAdmin: true });
    users.upsertFromClerk.mockResolvedValue(alreadyAdmin);

    const result = await useCase.execute({
      clerkId: 'clerk-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
    });

    expect(users.setSystemAdmin).not.toHaveBeenCalled();
    expect(result).toBe(alreadyAdmin);
  });
});
