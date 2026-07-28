import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokePermissionUseCase } from './revoke-permission.use-case';
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

describe('RevokePermissionUseCase', () => {
  let permissions: jest.Mocked<PermissionRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let events: { emit: jest.Mock };
  let useCase: RevokePermissionUseCase;

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
    useCase = new RevokePermissionUseCase(
      permissions,
      resolver,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it("throws NotFoundException when the permission doesn't exist", async () => {
    permissions.findById.mockResolvedValue(null);
    await expect(useCase.execute('actor-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires ADMIN+ on the resource', async () => {
    permissions.findById.mockResolvedValue(makePermission());
    resolver.requireRole.mockRejectedValue(new ForbiddenException());

    await expect(useCase.execute('actor-1', 'perm-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(permissions.delete).not.toHaveBeenCalled();
  });

  it('deletes the permission and emits a PERMISSION_CHANGE event once authorized', async () => {
    permissions.findById.mockResolvedValue(makePermission());
    resolver.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('actor-1', 'perm-1');

    expect(permissions.delete).toHaveBeenCalledWith('perm-1');
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'PERMISSION_CHANGE',
        metadata: { subjectId: 'subject-1', revoked: true },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'PERMISSION_REVOKED',
        outcome: 'SUCCESS',
        actorId: 'actor-1',
      }),
    );
  });
});
