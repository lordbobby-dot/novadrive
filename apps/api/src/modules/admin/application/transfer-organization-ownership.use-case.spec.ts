import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { TransferOrganizationOwnershipUseCase } from './transfer-organization-ownership.use-case';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';
import type { WorkspaceRepository } from '../../organizations/domain/workspace.repository';
import type { StorageQuotaRepository } from '../../quota/domain/storage-quota.repository';
import type { UserRepository } from '../../users/domain/user.repository';
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
    id: 'new-owner-1',
    clerkId: 'clerk-new-owner-1',
    email: 'newowner@example.com',
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

describe('TransferOrganizationOwnershipUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let users: jest.Mocked<UserRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: TransferOrganizationOwnershipUseCase;

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
    quotas = {
      findBySubject: jest.fn().mockResolvedValue(null),
      findManyBySubjects: jest.fn(),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn(),
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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new TransferOrganizationOwnershipUseCase(
      organizations,
      members,
      workspaces,
      quotas,
      users,
      events,
    );
  });

  it('throws NotFoundException for an unknown organization', async () => {
    organizations.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'org-1', 'new-owner-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the new owner does not exist', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    users.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'org-1', 'new-owner-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(organizations.transferOwnership).not.toHaveBeenCalled();
  });

  it('is idempotent when the new owner is already the owner (no-op, not blocked)', async () => {
    organizations.findById.mockResolvedValue(makeOrg({ ownerId: 'owner-1' }));

    const result = await useCase.execute('admin-1', 'org-1', 'owner-1');

    expect(organizations.transferOwnership).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(result.ownerId).toBe('owner-1');
  });

  it("removes the new owner's existing member row, downgrades the old owner to ADMIN, transfers ownership, and audits", async () => {
    organizations.findById
      .mockResolvedValueOnce(makeOrg({ ownerId: 'owner-1' }))
      .mockResolvedValueOnce(makeOrg({ ownerId: 'new-owner-1' }));
    users.findById.mockResolvedValue(makeUser());
    members.findByOrgAndUser.mockResolvedValue({
      id: 'm1',
      organizationId: 'org-1',
      userId: 'new-owner-1',
      role: 'EDITOR',
      createdAt: new Date(),
    });

    const result = await useCase.execute('admin-1', 'org-1', 'new-owner-1');

    expect(members.remove).toHaveBeenCalledWith('org-1', 'new-owner-1');
    expect(members.upsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      role: 'ADMIN',
    });
    expect(organizations.transferOwnership).toHaveBeenCalledWith(
      'org-1',
      'new-owner-1',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORGANIZATION_OWNER_TRANSFERRED',
        actorId: 'admin-1',
        targetId: 'org-1',
      }),
    );
    expect(result.ownerId).toBe('new-owner-1');
  });

  it('does not attempt to remove a member row the new owner never had', async () => {
    organizations.findById
      .mockResolvedValueOnce(makeOrg({ ownerId: 'owner-1' }))
      .mockResolvedValueOnce(makeOrg({ ownerId: 'new-owner-1' }));
    users.findById.mockResolvedValue(makeUser());
    members.findByOrgAndUser.mockResolvedValue(null);

    await useCase.execute('admin-1', 'org-1', 'new-owner-1');

    expect(members.remove).not.toHaveBeenCalled();
    expect(members.upsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      role: 'ADMIN',
    });
  });
});
