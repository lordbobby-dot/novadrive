import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RemoveOrganizationMemberUseCase } from './remove-organization-member.use-case';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { OrganizationMemberRepository } from '../domain/organization-member.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';
import type { Organization } from '../domain/organization.entity';

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

describe('RemoveOrganizationMemberUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let events: { emit: jest.Mock };
  let useCase: RemoveOrganizationMemberUseCase;

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
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    events = { emit: jest.fn() };
    useCase = new RemoveOrganizationMemberUseCase(
      organizations,
      members,
      orgRoles,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it('refuses to remove the org owner', async () => {
    organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'owner-1' }));
    await expect(
      useCase.execute('admin-1', 'org-1', 'owner-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(members.remove).not.toHaveBeenCalled();
  });

  it('requires ADMIN+ before removing a member', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'org-1', 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(members.remove).not.toHaveBeenCalled();
  });

  it('removes the member and emits activity + audit events once authorized', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    orgRoles.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('admin-1', 'org-1', 'target-1');

    expect(members.remove).toHaveBeenCalledWith('org-1', 'target-1');
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'PERMISSION_CHANGE',
        targetType: 'ORGANIZATION',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'PERMISSION_REVOKED' }),
    );
  });
});
