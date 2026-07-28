import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { ClerkWebhookController } from './clerk-webhook.controller';
import type { EnvConfig } from '../../../config/env.validation';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';
import type { SyncClerkUserUseCase } from '../../users/application/sync-clerk-user.use-case';
import type { DeleteClerkUserUseCase } from '../../users/application/delete-clerk-user.use-case';

jest.mock('@clerk/backend/webhooks', () => ({
  verifyWebhook: jest.fn(),
}));

const mockedVerifyWebhook = verifyWebhook as jest.MockedFunction<
  typeof verifyWebhook
>;

describe('ClerkWebhookController', () => {
  let controller: ClerkWebhookController;
  let config: ConfigService<EnvConfig, true>;
  let syncClerkUser: jest.Mocked<SyncClerkUserUseCase>;
  let deleteClerkUser: jest.Mocked<DeleteClerkUserUseCase>;
  let users: jest.Mocked<UserRepository>;
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
      get: jest.fn().mockReturnValue('whsec_test'),
    } as unknown as ConfigService<EnvConfig, true>;
    syncClerkUser = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SyncClerkUserUseCase>;
    deleteClerkUser = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteClerkUserUseCase>;
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
    controller = new ClerkWebhookController(
      config,
      syncClerkUser,
      deleteClerkUser,
      users,
      events,
    );
    mockedVerifyWebhook.mockReset();
  });

  function fakeRequest(rawBody?: Buffer) {
    return {
      protocol: 'https',
      originalUrl: '/webhooks/clerk',
      rawBody,
      get: () => 'api.novadrive.test',
      headers: {
        'svix-id': '1',
        'svix-timestamp': '1',
        'svix-signature': 'sig',
      },
    } as never;
  }

  it('rejects requests with no raw body', async () => {
    await expect(
      controller.handle(fakeRequest(undefined)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects requests with an invalid signature', async () => {
    mockedVerifyWebhook.mockRejectedValue(new Error('bad signature'));
    await expect(
      controller.handle(fakeRequest(Buffer.from('{}'))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('syncs the local user on user.created', async () => {
    mockedVerifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'clerk-1',
        email_addresses: [{ id: 'email-1', email_address: 'user@example.com' }],
        primary_email_address_id: 'email-1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        image_url: 'https://example.com/avatar.png',
      },
    } as never);

    const result = await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(syncClerkUser.execute).toHaveBeenCalledWith({
      clerkId: 'clerk-1',
      email: 'user@example.com',
      name: 'Ada Lovelace',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(result).toEqual({ received: true });
  });

  it('skips syncing when user.created has no primary email', async () => {
    mockedVerifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'clerk-1',
        email_addresses: [],
        primary_email_address_id: null,
        first_name: null,
        last_name: null,
        image_url: '',
      },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(syncClerkUser.execute).not.toHaveBeenCalled();
  });

  it('deletes the local user on user.deleted', async () => {
    mockedVerifyWebhook.mockResolvedValue({
      type: 'user.deleted',
      data: { id: 'clerk-1', object: 'user', deleted: true },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(deleteClerkUser.execute).toHaveBeenCalledWith('clerk-1');
  });

  it('records a LOGIN audit event on session.created, resolving the local actor', async () => {
    users.findByClerkId.mockResolvedValue(localUser);
    mockedVerifyWebhook.mockResolvedValue({
      type: 'session.created',
      data: {
        id: 'sess-1',
        user_id: 'clerk-1',
        latest_activity: { ip_address: '1.2.3.4', browser_name: 'Chrome' },
      },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(users.findByClerkId).toHaveBeenCalledWith('clerk-1');
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'LOGIN',
        outcome: 'SUCCESS',
        actorId: 'local-1',
        ipAddress: '1.2.3.4',
      }),
    );
  });

  it('records a LOGIN audit event with a null actor when the local user is unresolved', async () => {
    users.findByClerkId.mockResolvedValue(null);
    mockedVerifyWebhook.mockResolvedValue({
      type: 'session.created',
      data: { id: 'sess-1', user_id: 'clerk-unknown' },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'LOGIN', actorId: null }),
    );
  });

  it('records a LOGOUT audit event on session.ended', async () => {
    users.findByClerkId.mockResolvedValue(localUser);
    mockedVerifyWebhook.mockResolvedValue({
      type: 'session.ended',
      data: { id: 'sess-1', user_id: 'clerk-1' },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'LOGOUT', actorId: 'local-1' }),
    );
  });

  it('records a SESSION_REVOKED audit event on session.revoked', async () => {
    users.findByClerkId.mockResolvedValue(localUser);
    mockedVerifyWebhook.mockResolvedValue({
      type: 'session.revoked',
      data: { id: 'sess-1', user_id: 'clerk-1' },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'SESSION_REVOKED',
        actorId: 'local-1',
      }),
    );
  });

  it('ignores session.removed (not a real sign-in/out)', async () => {
    mockedVerifyWebhook.mockResolvedValue({
      type: 'session.removed',
      data: { id: 'sess-1', user_id: 'clerk-1' },
    } as never);

    await controller.handle(fakeRequest(Buffer.from('{}')));

    expect(events.emit).not.toHaveBeenCalled();
  });
});
