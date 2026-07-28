import { NotFoundException } from '@nestjs/common';
import { DeleteWorkspaceUseCase } from './delete-workspace.use-case';
import type { Workspace } from '../domain/workspace.entity';
import type { WorkspaceRepository } from '../domain/workspace.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    organizationId: 'org-1',
    name: 'Engineering',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DeleteWorkspaceUseCase', () => {
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: DeleteWorkspaceUseCase;

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
    useCase = new DeleteWorkspaceUseCase(workspaces, orgRoles);
  });

  it("throws NotFoundException when the workspace doesn't exist", async () => {
    workspaces.findById.mockResolvedValue(null);
    await expect(useCase.execute('actor-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(orgRoles.requireRole).not.toHaveBeenCalled();
  });

  it("requires ADMIN in the workspace's organization, then deletes", async () => {
    workspaces.findById.mockResolvedValue(makeWorkspace());
    orgRoles.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('actor-1', 'ws-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'ADMIN',
    );
    expect(workspaces.delete).toHaveBeenCalledWith('ws-1');
  });
});
