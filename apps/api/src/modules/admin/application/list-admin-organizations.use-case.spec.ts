import { ListAdminOrganizationsUseCase } from './list-admin-organizations.use-case';
import type {
  OrganizationRepository,
  OrganizationWithCounts,
} from '../../organizations/domain/organization.repository';
import type { StorageQuotaRepository } from '../../quota/domain/storage-quota.repository';
import type { StorageQuota } from '../../quota/domain/storage-quota.entity';

function makeOrg(id: string): OrganizationWithCounts {
  return {
    id,
    name: `Org ${id}`,
    ownerId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    memberCount: 3,
    workspaceCount: 2,
  };
}

function makeQuota(
  subjectId: string,
  overrides: Partial<StorageQuota> = {},
): StorageQuota {
  return {
    id: `quota-${subjectId}`,
    subjectType: 'ORGANIZATION',
    subjectId,
    limitBytes: '1000',
    usedBytes: '250',
    lastNotifiedThreshold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ListAdminOrganizationsUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let useCase: ListAdminOrganizationsUseCase;

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
    useCase = new ListAdminOrganizationsUseCase(organizations, quotas);
  });

  it('merges each org with its storage quota usage, defaulting to 0/null when no quota row exists yet', async () => {
    organizations.listAll.mockResolvedValue([
      makeOrg('org-1'),
      makeOrg('org-2'),
    ]);
    quotas.findManyBySubjects.mockResolvedValue([makeQuota('org-1')]);

    const page = await useCase.execute({ limit: 20 });

    expect(quotas.findManyBySubjects).toHaveBeenCalledWith('ORGANIZATION', [
      'org-1',
      'org-2',
    ]);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: 'org-1',
        storageUsedBytes: '250',
        storageLimitBytes: '1000',
      }),
      expect.objectContaining({
        id: 'org-2',
        storageUsedBytes: '0',
        storageLimitBytes: null,
      }),
    ]);
  });

  it('paginates via the lookahead-row cursor pattern before resolving quotas for just that page', async () => {
    organizations.listAll.mockResolvedValue([
      makeOrg('org-1'),
      makeOrg('org-2'),
      makeOrg('org-3'),
    ]);
    quotas.findManyBySubjects.mockResolvedValue([]);

    const page = await useCase.execute({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('org-2');
    expect(quotas.findManyBySubjects).toHaveBeenCalledWith('ORGANIZATION', [
      'org-1',
      'org-2',
    ]);
  });
});
