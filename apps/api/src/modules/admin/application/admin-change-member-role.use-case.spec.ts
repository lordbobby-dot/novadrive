import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminChangeMemberRoleUseCase } from './admin-change-member-role.use-case';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';
import type { Organization } from '../../organizations/domain/organization.entity';
import type { OrganizationMember } from '../../organizations/domain/organization-member.entity';

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
    userId: 'target-1',
    role: 'EDITOR',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AdminChangeMemberRoleUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: AdminChangeMemberRoleUseCase;

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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new AdminChangeMemberRoleUseCase(organizations, members, events);
  });

  it('throws NotFoundException for an unknown organization', async () => {
    organizations.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'org-1', 'target-1', 'ADMIN'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(members.upsert).not.toHaveBeenCalled();
  });

  it("rejects targeting the organization's own owner", async () => {
    organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'target-1' }));
    await expect(
      useCase.execute('admin-1', 'org-1', 'target-1', 'ADMIN'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(members.upsert).not.toHaveBeenCalled();
  });

  it("rejects setting a member's role to OWNER", async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    await expect(
      useCase.execute('admin-1', 'org-1', 'target-1', 'OWNER'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(members.upsert).not.toHaveBeenCalled();
  });

  it("changes a member's role directly, bypassing OrgRoleResolver, and audits it", async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    members.upsert.mockResolvedValue(makeMember({ role: 'ADMIN' }));

    const result = await useCase.execute(
      'admin-1',
      'org-1',
      'target-1',
      'ADMIN',
    );

    expect(members.upsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'target-1',
      role: 'ADMIN',
    });
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
        actorId: 'admin-1',
        targetId: 'org-1',
      }),
    );
    expect(result.role).toBe('ADMIN');
  });
});
