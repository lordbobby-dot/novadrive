import { NotFoundException } from '@nestjs/common';
import { GetOrganizationUseCase } from './get-organization.use-case';
import type { Organization } from '../domain/organization.entity';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';

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

describe('GetOrganizationUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: GetOrganizationUseCase;

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
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    useCase = new GetOrganizationUseCase(organizations, orgRoles);
  });

  it('requires at least VIEWER before returning the organization', async () => {
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    const org = makeOrg();
    organizations.findById.mockResolvedValue(org);

    const result = await useCase.execute('actor-1', 'org-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'VIEWER',
    );
    expect(result).toEqual({ organization: org, myRole: 'VIEWER' });
  });

  it('throws NotFoundException if the org row is gone despite a resolvable role', async () => {
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    organizations.findById.mockResolvedValue(null);

    await expect(useCase.execute('actor-1', 'org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
