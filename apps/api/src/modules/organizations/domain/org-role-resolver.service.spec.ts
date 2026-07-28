import { ForbiddenException } from '@nestjs/common';
import { OrgRoleResolver } from './org-role-resolver.service';
import type { Organization } from './organization.entity';
import type { OrganizationRepository } from './organization.repository';
import type { OrganizationMember } from './organization-member.entity';
import type { OrganizationMemberRepository } from './organization-member.repository';

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

function makeMember(
  overrides: Partial<OrganizationMember> = {},
): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: 'org-1',
    userId: 'member-user-1',
    role: 'EDITOR',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('OrgRoleResolver', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let resolver: OrgRoleResolver;

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
    resolver = new OrgRoleResolver(organizations, members);
  });

  describe('resolveRole', () => {
    it('returns null when the organization does not exist', async () => {
      organizations.findById.mockResolvedValue(null);
      const role = await resolver.resolveRole('actor-1', 'missing');
      expect(role).toBeNull();
    });

    it('returns OWNER for the org owner without querying membership at all', async () => {
      organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'actor-1' }));
      const role = await resolver.resolveRole('actor-1', 'org-1');
      expect(role).toBe('OWNER');
      expect(members.findByOrgAndUser).not.toHaveBeenCalled();
    });

    it("returns the explicit member's role", async () => {
      organizations.findById.mockResolvedValue(makeOrg());
      members.findByOrgAndUser.mockResolvedValue(
        makeMember({ role: 'VIEWER' }),
      );
      const role = await resolver.resolveRole('member-user-1', 'org-1');
      expect(role).toBe('VIEWER');
    });

    it('returns null when there is no membership row', async () => {
      organizations.findById.mockResolvedValue(makeOrg());
      members.findByOrgAndUser.mockResolvedValue(null);
      const role = await resolver.resolveRole('stranger', 'org-1');
      expect(role).toBeNull();
    });
  });

  describe('requireRole', () => {
    it('returns the role when it meets the minimum', async () => {
      organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'actor-1' }));
      const role = await resolver.requireRole('actor-1', 'org-1', 'ADMIN');
      expect(role).toBe('OWNER');
    });

    it('throws ForbiddenException when there is no membership at all', async () => {
      organizations.findById.mockResolvedValue(makeOrg());
      members.findByOrgAndUser.mockResolvedValue(null);
      await expect(
        resolver.requireRole('stranger', 'org-1', 'VIEWER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when the resolved role is below the minimum', async () => {
      organizations.findById.mockResolvedValue(makeOrg());
      members.findByOrgAndUser.mockResolvedValue(
        makeMember({ role: 'VIEWER' }),
      );
      await expect(
        resolver.requireRole('member-user-1', 'org-1', 'ADMIN'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("doesn't leak whether an org exists — missing org and insufficient role both reject the same way", async () => {
      organizations.findById.mockResolvedValue(null);
      await expect(
        resolver.requireRole('actor-1', 'missing', 'VIEWER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
