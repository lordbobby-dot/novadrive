import { UsersController } from './users.controller';
import type { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import type { User } from '../domain/user.entity';

describe('UsersController', () => {
  it('returns the current user mapped to a response DTO', async () => {
    const user: User = {
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
    const getCurrentUser = {
      execute: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<GetCurrentUserUseCase>;
    const controller = new UsersController(getCurrentUser);

    const result = await controller.me(user);

    expect(getCurrentUser.execute).toHaveBeenCalledWith('local-1');
    expect(result).toEqual({
      id: 'local-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
      isSystemAdmin: false,
      createdAt: user.createdAt,
    });
  });
});
