import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk-auth.guard';
import type { User } from '../../users/domain/user.entity';
import type { AuthenticateWithClerkTokenUseCase } from '../application/authenticate-with-clerk-token.use-case';

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let authenticate: jest.Mocked<AuthenticateWithClerkTokenUseCase>;

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
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    authenticate = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AuthenticateWithClerkTokenUseCase>;

    guard = new ClerkAuthGuard(reflector as unknown as Reflector, authenticate);
  });

  function contextWithHeader(authorization?: string): {
    context: ExecutionContext;
    request: Record<string, unknown>;
  } {
    const request: Record<string, unknown> = { headers: { authorization } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('allows access without checking a token when the route is marked @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = contextWithHeader(undefined);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authenticate.execute).not.toHaveBeenCalled();
  });

  it('rejects requests with no bearer token', async () => {
    const { context } = contextWithHeader(undefined);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticate.execute).not.toHaveBeenCalled();
  });

  it('rejects requests with a malformed authorization header', async () => {
    const { context } = contextWithHeader('Basic abc123');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates rejection from an invalid or expired token', async () => {
    authenticate.execute.mockRejectedValue(
      new UnauthorizedException('Invalid or expired token'),
    );
    const { context } = contextWithHeader('Bearer bad-token');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the resolved user and allows access for a valid token', async () => {
    authenticate.execute.mockResolvedValue(localUser);

    const { context, request } = contextWithHeader('Bearer good-token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authenticate.execute).toHaveBeenCalledWith('good-token');
    expect(request.user).toEqual(localUser);
  });
});
