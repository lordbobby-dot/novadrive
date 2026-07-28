import { ListOrganizationMembersUseCase } from './list-organization-members.use-case';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { OrganizationMemberRepository } from '../domain/organization-member.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';
import type { UserRepository } from '../../users/domain/user.repository';
import type { Organization } from '../domain/organization.entity';

describe('ListOrganizationMembersUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let users: jest.Mocked<UserRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: ListOrganizationMembersUseCase;

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
      listForOrganization: jest.fn(),
      listForUser: jest.fn(),
      remove: jest.fn(),
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
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    useCase = new ListOrganizationMembersUseCase(
      organizations,
      members,
      users,
      orgRoles,
    );
  });

  it('prepends a synthetic OWNER entry for the org owner, then real member rows with resolved emails', async () => {
    const org: Organization = {
      id: 'org-1',
      name: 'Acme',
      ownerId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    organizations.findById.mockResolvedValue(org);
    members.listForOrganization.mockResolvedValue([
      {
        id: 'member-1',
        organizationId: 'org-1',
        userId: 'user-2',
        role: 'EDITOR',
        createdAt: new Date(),
      },
    ]);
    users.findByIds.mockResolvedValue([
      {
        id: 'owner-1',
        clerkId: 'clerk-owner',
        email: 'owner@example.com',
        name: 'Owner',
        avatarUrl: null,
        isSystemAdmin: false,
        isSuspended: false,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-2',
        clerkId: 'clerk-2',
        email: 'editor@example.com',
        name: 'Editor',
        avatarUrl: null,
        isSystemAdmin: false,
        isSuspended: false,
        suspendedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await useCase.execute('actor-1', 'org-1');

    expect(result).toHaveLength(2);
    expect(result[0].member.role).toBe('OWNER');
    expect(result[0].member.userId).toBe('owner-1');
    expect(result[0].email).toBe('owner@example.com');
    expect(result[1].member.userId).toBe('user-2');
    expect(result[1].member.role).toBe('EDITOR');
    expect(result[1].email).toBe('editor@example.com');
  });
});
