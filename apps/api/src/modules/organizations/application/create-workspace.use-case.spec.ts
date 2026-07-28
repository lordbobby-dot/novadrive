import { ForbiddenException } from '@nestjs/common';
import { CreateWorkspaceUseCase } from './create-workspace.use-case';
import type { WorkspaceRepository } from '../domain/workspace.repository';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';
import type { Workspace } from '../domain/workspace.entity';
import type { Folder } from '../../folders/domain/folder.entity';

describe('CreateWorkspaceUseCase', () => {
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: CreateWorkspaceUseCase;

  beforeEach(() => {
    workspaces = {
      create: jest.fn(),
      findById: jest.fn(),
      listForOrganization: jest.fn(),
      rename: jest.fn(),
      delete: jest.fn(),
    };
    folders = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findRoot: jest.fn(),
      createRoot: jest.fn(),
      createWorkspaceRoot: jest.fn(),
      findWorkspaceRoot: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      findChildren: jest.fn(),
      findDescendantIds: jest.fn(),
      move: jest.fn(),
      softDeleteSubtree: jest.fn(),
      isTrashed: jest.fn(),
      restoreSubtree: jest.fn(),
      deleteRow: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    useCase = new CreateWorkspaceUseCase(workspaces, folders, orgRoles);
  });

  it('requires ADMIN+ org role before creating a workspace', async () => {
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute({
        actorId: 'actor-1',
        organizationId: 'org-1',
        name: 'Eng',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(workspaces.create).not.toHaveBeenCalled();
  });

  it('creates the workspace and its root folder together', async () => {
    orgRoles.requireRole.mockResolvedValue('ADMIN');
    const workspace: Workspace = {
      id: 'ws-1',
      organizationId: 'org-1',
      name: 'Eng',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    workspaces.create.mockResolvedValue(workspace);
    const root: Folder = {
      id: 'ws-root',
      name: 'Eng',
      ownerId: 'actor-1',
      parentId: null,
      path: '/',
      depth: 0,
      organizationId: 'org-1',
      workspaceId: 'ws-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    folders.createWorkspaceRoot.mockResolvedValue(root);

    const result = await useCase.execute({
      actorId: 'actor-1',
      organizationId: 'org-1',
      name: 'Eng',
    });

    expect(workspaces.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      name: 'Eng',
    });
    expect(folders.createWorkspaceRoot).toHaveBeenCalledWith({
      ownerId: 'actor-1',
      organizationId: 'org-1',
      workspaceId: 'ws-1',
      name: 'Eng',
    });
    expect(result).toBe(workspace);
  });
});
