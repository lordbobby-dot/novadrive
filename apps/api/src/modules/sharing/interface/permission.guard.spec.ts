import { BadRequestException, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import type { PermissionResolver } from '../domain/permission-resolver.service';
import type { PermissionCheck } from './require-permission.decorator';

function makeContext(
  params: Record<string, string>,
  body: Record<string, unknown>,
  query: Record<string, string> = {},
): ExecutionContext {
  const request = { user: { id: 'actor-1' }, params, body, query };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let resolver: jest.Mocked<PermissionResolver>;
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = { get: jest.fn() } as unknown as jest.Mocked<Reflector>;
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    guard = new PermissionGuard(reflector, resolver);
  });

  it('allows the request through when no @RequirePermission metadata is present', async () => {
    reflector.get.mockReturnValue(undefined);
    const result = await guard.canActivate(makeContext({}, {}));
    expect(result).toBe(true);
    expect(resolver.requireRole).not.toHaveBeenCalled();
  });

  it('checks the resource id from route params', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FOLDER',
        minimumRole: 'VIEWER',
        source: 'params',
        field: 'id',
      },
    ];
    reflector.get.mockReturnValue(checks);
    resolver.requireRole.mockResolvedValue('OWNER');

    const result = await guard.canActivate(makeContext({ id: 'folder-1' }, {}));

    expect(result).toBe(true);
    expect(resolver.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'FOLDER',
      'folder-1',
      'VIEWER',
    );
  });

  it('checks the resource id from the request body', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FOLDER',
        minimumRole: 'EDITOR',
        source: 'body',
        field: 'parentId',
      },
    ];
    reflector.get.mockReturnValue(checks);
    resolver.requireRole.mockResolvedValue('EDITOR');

    await guard.canActivate(makeContext({}, { parentId: 'folder-2' }));

    expect(resolver.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'FOLDER',
      'folder-2',
      'EDITOR',
    );
  });

  it('checks the resource id from the query string', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FOLDER',
        minimumRole: 'VIEWER',
        source: 'query',
        field: 'folderId',
      },
    ];
    reflector.get.mockReturnValue(checks);
    resolver.requireRole.mockResolvedValue('VIEWER');

    await guard.canActivate(makeContext({}, {}, { folderId: 'folder-3' }));

    expect(resolver.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'FOLDER',
      'folder-3',
      'VIEWER',
    );
  });

  it('runs every stacked check (e.g. move: source + destination)', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FOLDER',
        minimumRole: 'EDITOR',
        source: 'params',
        field: 'id',
      },
      {
        resourceType: 'FOLDER',
        minimumRole: 'EDITOR',
        source: 'body',
        field: 'targetParentId',
      },
    ];
    reflector.get.mockReturnValue(checks);
    resolver.requireRole.mockResolvedValue('EDITOR');

    await guard.canActivate(
      makeContext({ id: 'src' }, { targetParentId: 'dest' }),
    );

    expect(resolver.requireRole).toHaveBeenCalledTimes(2);
    expect(resolver.requireRole).toHaveBeenNthCalledWith(
      1,
      'actor-1',
      'FOLDER',
      'src',
      'EDITOR',
    );
    expect(resolver.requireRole).toHaveBeenNthCalledWith(
      2,
      'actor-1',
      'FOLDER',
      'dest',
      'EDITOR',
    );
  });

  it('skips an optional check when the field is absent', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FILE',
        minimumRole: 'EDITOR',
        source: 'body',
        field: 'versionOfFileId',
        optional: true,
      },
    ];
    reflector.get.mockReturnValue(checks);

    const result = await guard.canActivate(makeContext({}, {}));

    expect(result).toBe(true);
    expect(resolver.requireRole).not.toHaveBeenCalled();
  });

  it('rejects with BadRequestException when a required field is missing', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FOLDER',
        minimumRole: 'EDITOR',
        source: 'body',
        field: 'folderId',
      },
    ];
    reflector.get.mockReturnValue(checks);

    await expect(guard.canActivate(makeContext({}, {}))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('propagates ForbiddenException from the resolver', async () => {
    const checks: PermissionCheck[] = [
      {
        resourceType: 'FOLDER',
        minimumRole: 'EDITOR',
        source: 'params',
        field: 'id',
      },
    ];
    reflector.get.mockReturnValue(checks);
    resolver.requireRole.mockRejectedValue(new Error('forbidden'));

    await expect(
      guard.canActivate(makeContext({ id: 'folder-1' }, {})),
    ).rejects.toThrow('forbidden');
  });
});
