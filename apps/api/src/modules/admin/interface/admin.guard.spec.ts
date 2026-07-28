import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminGuard } from './admin.guard';
import type { User } from '../../users/domain/user.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    clerkId: 'clerk-1',
    email: 'user@example.com',
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

function makeContext(user: User): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: AdminGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new AdminGuard(reflector);
  });

  it('is a no-op when the route has no @RequireAdmin() metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(makeUser()))).toBe(true);
  });

  it('allows a system admin through on an admin-gated route', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(
      guard.canActivate(makeContext(makeUser({ isSystemAdmin: true }))),
    ).toBe(true);
  });

  it('rejects a non-admin on an admin-gated route', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(() => guard.canActivate(makeContext(makeUser()))).toThrow(
      ForbiddenException,
    );
  });
});
