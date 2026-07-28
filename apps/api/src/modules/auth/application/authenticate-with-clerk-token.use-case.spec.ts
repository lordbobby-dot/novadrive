import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { verifyToken } from '@clerk/backend';
import { AuthenticateWithClerkTokenUseCase } from './authenticate-with-clerk-token.use-case';
import type { EnvConfig } from '../../../config/env.validation';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';
import type { SyncClerkUserUseCase } from '../../users/application/sync-clerk-user.use-case';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;

describe('AuthenticateWithClerkTokenUseCase', () => {
  let useCase: AuthenticateWithClerkTokenUseCase;
  let config: ConfigService<EnvConfig, true>;
  let clerkClient: { users: { getUser: jest.Mock } };
  let users: jest.Mocked<UserRepository>;
  let syncClerkUser: jest.Mocked<SyncClerkUserUseCase>;
  let events: jest.Mocked<EventEmitter2>;

  const localUser: User = {
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
  };

  beforeEach(() => {
    config = {
      get: jest.fn().mockReturnValue('sk_test_xxx'),
    } as unknown as ConfigService<EnvConfig, true>;
    clerkClient = { users: { getUser: jest.fn() } };
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
    syncClerkUser = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SyncClerkUserUseCase>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    useCase = new AuthenticateWithClerkTokenUseCase(
      config,
      clerkClient as never,
      users,
      syncClerkUser,
      events,
    );

    mockedVerifyToken.mockReset();
  });

  it('rejects an invalid or expired token', async () => {
    mockedVerifyToken.mockRejectedValue(new Error('expired'));
    await expect(useCase.execute('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'AUTH_TOKEN_REJECTED',
        outcome: 'FAILURE',
        actorId: null,
      }),
    );
  });

  it('resolves the local user for a valid token when the user already exists', async () => {
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk-1' } as never);
    users.findByClerkId.mockResolvedValue(localUser);

    const result = await useCase.execute('good-token');

    expect(result).toEqual(localUser);
    expect(clerkClient.users.getUser).not.toHaveBeenCalled();
  });

  it('rejects a suspended user even with an otherwise-valid token (defense in depth alongside Clerk banUser)', async () => {
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk-1' } as never);
    users.findByClerkId.mockResolvedValue({
      ...localUser,
      isSuspended: true,
      suspendedAt: new Date(),
    });

    await expect(useCase.execute('good-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'AUTH_TOKEN_REJECTED',
        outcome: 'FAILURE',
        actorId: 'local-1',
        metadata: { reason: 'account_suspended' },
      }),
    );
  });

  it('lazily syncs from Clerk when no local user exists yet', async () => {
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk-1' } as never);
    users.findByClerkId.mockResolvedValue(null);
    clerkClient.users.getUser.mockResolvedValue({
      id: 'clerk-1',
      emailAddresses: [{ id: 'email-1', emailAddress: 'new@example.com' }],
      primaryEmailAddressId: 'email-1',
      firstName: 'New',
      lastName: 'User',
      imageUrl: 'https://example.com/avatar.png',
    });
    syncClerkUser.execute.mockResolvedValue(localUser);

    const result = await useCase.execute('good-token');

    expect(syncClerkUser.execute).toHaveBeenCalledWith({
      clerkId: 'clerk-1',
      email: 'new@example.com',
      name: 'New User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(result).toEqual(localUser);
  });

  it('rejects when the Clerk user has no primary email address', async () => {
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk-1' } as never);
    users.findByClerkId.mockResolvedValue(null);
    clerkClient.users.getUser.mockResolvedValue({
      id: 'clerk-1',
      emailAddresses: [],
      primaryEmailAddressId: null,
      firstName: null,
      lastName: null,
      imageUrl: '',
    });

    await expect(useCase.execute('good-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
