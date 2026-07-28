import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChangeMemberRoleUseCase } from './change-member-role.use-case';
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

describe('ChangeMemberRoleUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let events: { emit: jest.Mock };
  let useCase: ChangeMemberRoleUseCase;

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
    useCase = new ChangeMemberRoleUseCase(
      organizations,
      members,
      orgRoles,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it("refuses to change the org owner's role", async () => {
    organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'owner-1' }));
    await expect(
      useCase.execute('admin-1', 'org-1', 'owner-1', 'VIEWER'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orgRoles.requireRole).not.toHaveBeenCalled();
  });

  it('requires ADMIN+ before changing a role', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'org-1', 'target-1', 'VIEWER'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks an ADMIN from granting a role higher than their own (can't mint an OWNER)", async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    orgRoles.requireRole.mockResolvedValue('ADMIN');

    await expect(
      useCase.execute('admin-1', 'org-1', 'target-1', 'OWNER'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(members.upsert).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'PERMISSION_ESCALATION_ATTEMPT' }),
    );
  });

  it('allows an ADMIN to grant a role at or below their own', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    orgRoles.requireRole.mockResolvedValue('ADMIN');
    members.upsert.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      userId: 'target-1',
      role: 'EDITOR',
      createdAt: new Date(),
    });

    const result = await useCase.execute(
      'admin-1',
      'org-1',
      'target-1',
      'EDITOR',
    );

    expect(members.upsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'target-1',
      role: 'EDITOR',
    });
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'PERMISSION_CHANGE',
        targetType: 'ORGANIZATION',
        // metadata.subjectId, not targetUserId — NotificationEventListener.resolveRecipient
        // reads this exact key for every PERMISSION_CHANGE notification.
        metadata: { subjectId: 'target-1', role: 'EDITOR' },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'PERMISSION_GRANTED' }),
    );
    expect(result.role).toBe('EDITOR');
  });
});
