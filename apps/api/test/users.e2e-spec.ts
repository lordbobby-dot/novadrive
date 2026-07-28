import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { UsersController } from '../src/modules/users/interface/users.controller';
import { GetCurrentUserUseCase } from '../src/modules/users/application/get-current-user.use-case';
import { SyncClerkUserUseCase } from '../src/modules/users/application/sync-clerk-user.use-case';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../src/modules/users/domain/user.repository';
import { User } from '../src/modules/users/domain/user.entity';
import { ClerkAuthGuard } from '../src/modules/auth/interface/clerk-auth.guard';
import { AuthenticateWithClerkTokenUseCase } from '../src/modules/auth/application/authenticate-with-clerk-token.use-case';
import { CLERK_CLIENT } from '../src/modules/auth/infrastructure/clerk-client.provider';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;

describe('GET /users/me (e2e)', () => {
  let app: INestApplication<App>;

  const storedUser: User = {
    id: 'local-1',
    clerkId: 'clerk-1',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const fakeUserRepository: jest.Mocked<UserRepository> = {
    findByClerkId: jest.fn((clerkId: string) =>
      Promise.resolve(clerkId === storedUser.clerkId ? storedUser : null),
    ),
    findById: jest.fn((id: string) =>
      Promise.resolve(id === storedUser.id ? storedUser : null),
    ),
    findByEmail: jest.fn((email: string) =>
      Promise.resolve(email === storedUser.email ? storedUser : null),
    ),
    findByIds: jest.fn(),
    upsertFromClerk: jest.fn(),
    deleteByClerkId: jest.fn(),
    list: jest.fn(),
    setSystemAdmin: jest.fn(),
    setSuspended: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [UsersController],
      providers: [
        GetCurrentUserUseCase,
        SyncClerkUserUseCase,
        AuthenticateWithClerkTokenUseCase,
        { provide: APP_GUARD, useClass: ClerkAuthGuard },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        {
          provide: ConfigService,
          useValue: { get: () => 'sk_test_placeholder' },
        },
        { provide: CLERK_CLIENT, useValue: { users: { getUser: jest.fn() } } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 with no Authorization header', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('returns 401 with an invalid token', async () => {
    mockedVerifyToken.mockRejectedValueOnce(new Error('invalid'));
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer bad')
      .expect(401);
  });

  it("returns the synced user's profile for a valid token", async () => {
    mockedVerifyToken.mockResolvedValueOnce({
      sub: storedUser.clerkId,
    } as never);

    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer good')
      .expect(200);

    expect(response.body).toMatchObject({
      id: storedUser.id,
      email: storedUser.email,
      name: storedUser.name,
    });
  });
});
