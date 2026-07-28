import { NotFoundException } from '@nestjs/common';
import { GetAdminOrganizationDetailUseCase } from './get-admin-organization-detail.use-case';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';
import type { WorkspaceRepository } from '../../organizations/domain/workspace.repository';
import type { UserRepository } from '../../users/domain/user.repository';
import type { StorageQuotaRepository } from '../../quota/domain/storage-quota.repository';
import type { Organization } from '../../organizations/domain/organization.entity';
import type { User } from '../../users/domain/user.entity';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Acme',
    ownerId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'owner-1',
    clerkId: 'clerk-owner-1',
    email: 'owner@example.com',
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

describe('GetAdminOrganizationDetailUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let users: jest.Mocked<UserRepository>;
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let useCase: GetAdminOrganizationDetailUseCase;

  beforeEach(() => {
    organizations = {
      create: jest.fn(),
      findById: jest.fn(),
      listForActor: jest.fn(),
      listAll: jest.fn(),
      rename: jest.fn(),
      transferOwnership: jest.fn(),
      delete: jest.fn(),
    };
    members = {
      upsert: jest.fn(),
      findByOrgAndUser: jest.fn(),
      listForOrganization: jest.fn().mockResolvedValue([]),
      listForUser: jest.fn(),
      remove: jest.fn(),
    };
    workspaces = {
      create: jest.fn(),
      findById: jest.fn(),
      listForOrganization: jest.fn().mockResolvedValue([]),
      rename: jest.fn(),
      delete: jest.fn(),
    };
    users = {
      findByClerkId: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([]),
      upsertFromClerk: jest.fn(),
      deleteByClerkId: jest.fn(),
      list: jest.fn(),
      setSystemAdmin: jest.fn(),
      setSuspended: jest.fn(),
    };
    quotas = {
      findBySubject: jest.fn(),
      findManyBySubjects: jest.fn(),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn(),
    };
    useCase = new GetAdminOrganizationDetailUseCase(
      organizations,
      members,
      workspaces,
      users,
      quotas,
    );
  });

  it('throws NotFoundException for an unknown organization', async () => {
    organizations.findById.mockResolvedValue(null);
    await expect(useCase.execute('org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('prepends a synthetic OWNER entry not present in the member rows', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    users.findByIds.mockResolvedValue([makeUser()]);

    const detail = await useCase.execute('org-1');

    expect(detail.members).toHaveLength(1);
    expect(detail.members[0].member.role).toBe('OWNER');
    expect(detail.members[0].member.userId).toBe('owner-1');
    expect(detail.members[0].email).toBe('owner@example.com');
  });

  it('reports null storageLimitBytes when no StorageQuota row exists yet', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    users.findByIds.mockResolvedValue([makeUser()]);
    quotas.findBySubject.mockResolvedValue(null);

    const detail = await useCase.execute('org-1');

    expect(detail.organization.storageUsedBytes).toBe('0');
    expect(detail.organization.storageLimitBytes).toBeNull();
  });

  it('counts memberCount as explicit members + 1 (the implicit owner) and passes through workspaces', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    members.listForOrganization.mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'org-1',
        userId: 'u2',
        role: 'EDITOR',
        createdAt: new Date(),
      },
    ]);
    workspaces.listForOrganization.mockResolvedValue([
      {
        id: 'w1',
        organizationId: 'org-1',
        name: 'Main',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    users.findByIds.mockResolvedValue([makeUser()]);
    quotas.findBySubject.mockResolvedValue({
      id: 'q1',
      subjectType: 'ORGANIZATION',
      subjectId: 'org-1',
      limitBytes: '1000',
      usedBytes: '500',
      lastNotifiedThreshold: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const detail = await useCase.execute('org-1');

    expect(detail.organization.memberCount).toBe(2);
    expect(detail.organization.workspaceCount).toBe(1);
    expect(detail.organization.storageUsedBytes).toBe('500');
    expect(detail.organization.storageLimitBytes).toBe('1000');
    expect(detail.workspaces).toHaveLength(1);
  });
});
