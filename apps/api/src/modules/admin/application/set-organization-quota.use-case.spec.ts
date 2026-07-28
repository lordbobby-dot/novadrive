import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SetOrganizationQuotaUseCase } from './set-organization-quota.use-case';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';
import type { WorkspaceRepository } from '../../organizations/domain/workspace.repository';
import type { StorageQuotaRepository } from '../../quota/domain/storage-quota.repository';
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

describe('SetOrganizationQuotaUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: SetOrganizationQuotaUseCase;

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
      findBySubject: jest.fn(),
      findManyBySubjects: jest.fn(),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn(),
    };
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new SetOrganizationQuotaUseCase(
      organizations,
      members,
      workspaces,
      quotas,
      events,
    );
  });

  it('rejects a zero or negative limit', async () => {
    await expect(
      useCase.execute('admin-1', 'org-1', '0'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      useCase.execute('admin-1', 'org-1', '-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quotas.setLimit).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown organization', async () => {
    organizations.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('admin-1', 'org-1', '5000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets the limit, audits ORGANIZATION_QUOTA_UPDATED, and returns the merged summary', async () => {
    organizations.findById.mockResolvedValue(makeOrg());
    quotas.setLimit.mockResolvedValue({
      id: 'q1',
      subjectType: 'ORGANIZATION',
      subjectId: 'org-1',
      limitBytes: '5000000000',
      usedBytes: '42',
      lastNotifiedThreshold: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await useCase.execute('admin-1', 'org-1', '5000000000');

    expect(quotas.setLimit).toHaveBeenCalledWith(
      'ORGANIZATION',
      'org-1',
      '5000000000',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORGANIZATION_QUOTA_UPDATED',
        actorId: 'admin-1',
        targetId: 'org-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'org-1',
      storageUsedBytes: '42',
      storageLimitBytes: '5000000000',
    });
  });
});
