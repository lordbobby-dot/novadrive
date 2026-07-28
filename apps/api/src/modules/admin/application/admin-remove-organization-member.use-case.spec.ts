import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminRemoveOrganizationMemberUseCase } from './admin-remove-organization-member.use-case';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';
import type { Organization } from '../../organizations/domain/organization.entity';

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

describe('AdminRemoveOrganizationMemberUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: AdminRemoveOrganizationMemberUseCase;

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
    useCase = new AdminRemoveOrganizationMemberUseCase(
      organizations,
      members,
      events,
    );
  });

  it('throws NotFoundException for an unknown organization', async () => {
    organizations.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'org-1', 'target-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(members.remove).not.toHaveBeenCalled();
  });

  it("rejects removing the organization's own owner", async () => {
    organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'target-1' }));
    await expect(
      useCase.execute('admin-1', 'org-1', 'target-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(members.remove).not.toHaveBeenCalled();
  });

  it('removes a member directly, bypassing OrgRoleResolver, and audits it', async () => {
    organizations.findById.mockResolvedValue(makeOrg());

    await useCase.execute('admin-1', 'org-1', 'target-1');

    expect(members.remove).toHaveBeenCalledWith('org-1', 'target-1');
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORGANIZATION_MEMBER_REMOVED',
        actorId: 'admin-1',
        targetId: 'org-1',
      }),
    );
  });
});
