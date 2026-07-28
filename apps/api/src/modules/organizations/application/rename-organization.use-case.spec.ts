import { ForbiddenException } from '@nestjs/common';
import { RenameOrganizationUseCase } from './rename-organization.use-case';
import type { Organization } from '../domain/organization.entity';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';

describe('RenameOrganizationUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: RenameOrganizationUseCase;

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
    useCase = new RenameOrganizationUseCase(organizations, orgRoles);
  });

  it('requires ADMIN before renaming', async () => {
    orgRoles.requireRole.mockResolvedValue('ADMIN');
    const renamed: Organization = {
      id: 'org-1',
      name: 'New Name',
      ownerId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    organizations.rename.mockResolvedValue(renamed);

    const result = await useCase.execute('actor-1', 'org-1', 'New Name');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'ADMIN',
    );
    expect(organizations.rename).toHaveBeenCalledWith('org-1', 'New Name');
    expect(result).toBe(renamed);
  });

  it('propagates ForbiddenException without renaming', async () => {
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'org-1', 'New Name'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(organizations.rename).not.toHaveBeenCalled();
  });
});
