import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GrantPermissionUseCase } from './grant-permission.use-case';
import type { Permission } from '../domain/permission.entity';
import type { PermissionRepository } from '../domain/permission.repository';
import type { PermissionResolver } from '../domain/permission-resolver.service';

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-1',
    subjectId: 'subject-1',
    resourceType: 'FILE',
    resourceId: 'file-1',
    role: 'EDITOR',
    grantedBy: 'granter-1',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GrantPermissionUseCase', () => {
  let permissions: jest.Mocked<PermissionRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let events: { emit: jest.Mock };
  let useCase: GrantPermissionUseCase;

  beforeEach(() => {
    permissions = {
      findExplicit: jest.fn(),
      findManyForSubject: jest.fn(),
      upsert: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      listForResource: jest.fn(),
      listGrantedToSubject: jest.fn(),
    };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    events = { emit: jest.fn() };
    useCase = new GrantPermissionUseCase(
      permissions,
      resolver,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it('rejects granting a permission to yourself', async () => {
    await expect(
      useCase.execute({
        granterId: 'user-1',
        subjectId: 'user-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(resolver.requireRole).not.toHaveBeenCalled();
  });

  it('requires ADMIN+ on the resource', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute({
        granterId: 'granter-1',
        subjectId: 'subject-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects granting a role higher than the granter's own", async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    await expect(
      useCase.execute({
        granterId: 'granter-1',
        subjectId: 'subject-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.upsert).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'PERMISSION_ESCALATION_ATTEMPT',
        outcome: 'FAILURE',
        actorId: 'granter-1',
      }),
    );
  });

  it('allows an ADMIN to grant a role equal to their own', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    permissions.upsert.mockResolvedValue(makePermission({ role: 'ADMIN' }));

    const result = await useCase.execute({
      granterId: 'granter-1',
      subjectId: 'subject-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'ADMIN',
    });

    expect(permissions.upsert).toHaveBeenCalledWith({
      subjectId: 'subject-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'ADMIN',
      grantedBy: 'granter-1',
    });
    expect(result.role).toBe('ADMIN');
  });

  it('allows an OWNER to grant any role including OWNER', async () => {
    resolver.requireRole.mockResolvedValue('OWNER');
    permissions.upsert.mockResolvedValue(makePermission({ role: 'OWNER' }));

    await useCase.execute({
      granterId: 'granter-1',
      subjectId: 'subject-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'OWNER',
    });

    expect(permissions.upsert).toHaveBeenCalled();
  });

  it('emits a PERMISSION_CHANGE activity event', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    permissions.upsert.mockResolvedValue(makePermission());

    await useCase.execute({
      granterId: 'granter-1',
      subjectId: 'subject-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'EDITOR',
    });

    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'granter-1',
        action: 'PERMISSION_CHANGE',
        targetType: 'FILE',
        targetId: 'file-1',
        metadata: { subjectId: 'subject-1', role: 'EDITOR' },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'PERMISSION_GRANTED',
        outcome: 'SUCCESS',
        actorId: 'granter-1',
      }),
    );
  });
});
