import { ForbiddenException } from '@nestjs/common';
import { DeleteOrganizationUseCase } from './delete-organization.use-case';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';

describe('DeleteOrganizationUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: DeleteOrganizationUseCase;

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
    useCase = new DeleteOrganizationUseCase(organizations, orgRoles);
  });

  it('requires OWNER and deletes only once that check passes', async () => {
    orgRoles.requireRole.mockResolvedValue('OWNER');

    await useCase.execute('actor-1', 'org-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'OWNER',
    );
    expect(organizations.delete).toHaveBeenCalledWith('org-1');
  });

  it('propagates ForbiddenException from the role check without deleting', async () => {
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());

    await expect(useCase.execute('actor-1', 'org-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(organizations.delete).not.toHaveBeenCalled();
  });
});
