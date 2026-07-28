import { ForbiddenException } from '@nestjs/common';
import { ListPermissionsForResourceUseCase } from './list-permissions-for-resource.use-case';
import type { Permission } from '../domain/permission.entity';
import type { PermissionRepository } from '../domain/permission.repository';
import type { PermissionResolver } from '../domain/permission-resolver.service';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'subject-1',
    clerkId: 'clerk-subject-1',
    email: 'collaborator@example.com',
    name: 'Collaborator',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ListPermissionsForResourceUseCase', () => {
  let permissions: jest.Mocked<PermissionRepository>;
  let users: jest.Mocked<UserRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: ListPermissionsForResourceUseCase;

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
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    useCase = new ListPermissionsForResourceUseCase(
      permissions,
      users,
      resolver,
    );
  });

  it('requires ADMIN+ before listing grants', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'FILE', 'file-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.listForResource).not.toHaveBeenCalled();
  });

  it('returns every grant on the resource, enriched with the subject email/name, once authorized', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    const grants: Permission[] = [
      {
        id: 'perm-1',
        subjectId: 'subject-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
        grantedBy: 'owner-1',
        createdAt: new Date(),
      },
    ];
    permissions.listForResource.mockResolvedValue(grants);
    users.findByIds.mockResolvedValue([makeUser()]);

    const result = await useCase.execute('actor-1', 'FILE', 'file-1');

    expect(permissions.listForResource).toHaveBeenCalledWith('FILE', 'file-1');
    expect(users.findByIds).toHaveBeenCalledWith(['subject-1']);
    expect(result).toEqual([
      {
        permission: grants[0],
        subjectEmail: 'collaborator@example.com',
        subjectName: 'Collaborator',
      },
    ]);
  });

  it('leaves email/name null when the subject user record is missing', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    const grants: Permission[] = [
      {
        id: 'perm-1',
        subjectId: 'deleted-user',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'VIEWER',
        grantedBy: 'owner-1',
        createdAt: new Date(),
      },
    ];
    permissions.listForResource.mockResolvedValue(grants);
    users.findByIds.mockResolvedValue([]);

    const result = await useCase.execute('actor-1', 'FILE', 'file-1');

    expect(result[0].subjectEmail).toBeNull();
    expect(result[0].subjectName).toBeNull();
  });
});
