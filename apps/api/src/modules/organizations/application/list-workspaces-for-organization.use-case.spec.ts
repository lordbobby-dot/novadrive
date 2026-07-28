import { ForbiddenException } from '@nestjs/common';
import { ListWorkspacesForOrganizationUseCase } from './list-workspaces-for-organization.use-case';
import type { Workspace } from '../domain/workspace.entity';
import type { WorkspaceRepository } from '../domain/workspace.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';

describe('ListWorkspacesForOrganizationUseCase', () => {
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: ListWorkspacesForOrganizationUseCase;

  beforeEach(() => {
    workspaces = {
      create: jest.fn(),
      findById: jest.fn(),
      listForOrganization: jest.fn(),
      rename: jest.fn(),
      delete: jest.fn(),
    };
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    useCase = new ListWorkspacesForOrganizationUseCase(workspaces, orgRoles);
  });

  it('requires at least VIEWER before listing', async () => {
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    const list: Workspace[] = [
      {
        id: 'ws-1',
        organizationId: 'org-1',
        name: 'Eng',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    workspaces.listForOrganization.mockResolvedValue(list);

    const result = await useCase.execute('actor-1', 'org-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'VIEWER',
    );
    expect(workspaces.listForOrganization).toHaveBeenCalledWith('org-1');
    expect(result).toBe(list);
  });

  it('propagates ForbiddenException without listing', async () => {
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(useCase.execute('actor-1', 'org-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(workspaces.listForOrganization).not.toHaveBeenCalled();
  });
});
