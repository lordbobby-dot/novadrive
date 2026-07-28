import { NotFoundException } from '@nestjs/common';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import type { User } from '../domain/user.entity';
import type { UserRepository } from '../domain/user.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
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

describe('GetCurrentUserUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let useCase: GetCurrentUserUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      findByClerkId: jest.fn(),
      findByEmail: jest.fn(),
      findByIds: jest.fn(),
      upsertFromClerk: jest.fn(),
      deleteByClerkId: jest.fn(),
      list: jest.fn(),
      setSystemAdmin: jest.fn(),
      setSuspended: jest.fn(),
    };
    useCase = new GetCurrentUserUseCase(users);
  });

  it("throws NotFoundException when the user row doesn't exist", async () => {
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the user for a valid id', async () => {
    const user = makeUser();
    users.findById.mockResolvedValue(user);

    const result = await useCase.execute('user-1');

    expect(users.findById).toHaveBeenCalledWith('user-1');
    expect(result).toBe(user);
  });
});
