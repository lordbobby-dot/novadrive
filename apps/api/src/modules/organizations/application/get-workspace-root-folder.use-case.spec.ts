import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { GetWorkspaceRootFolderUseCase } from './get-workspace-root-folder.use-case';
import type { WorkspaceRepository } from '../domain/workspace.repository';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { OrgRoleResolver } from '../domain/org-role-resolver.service';
import type { Workspace } from '../domain/workspace.entity';
import type { Folder } from '../../folders/domain/folder.entity';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    organizationId: 'org-1',
    name: 'Eng',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'ws-root',
    name: 'Eng',
    ownerId: 'creator-1',
    parentId: null,
    path: '/',
    depth: 0,
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GetWorkspaceRootFolderUseCase', () => {
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: GetWorkspaceRootFolderUseCase;

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
    useCase = new GetWorkspaceRootFolderUseCase(workspaces, folders, orgRoles);
  });

  it("throws NotFoundException when the workspace doesn't exist", async () => {
    workspaces.findById.mockResolvedValue(null);
    await expect(useCase.execute('actor-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires VIEWER+ org role', async () => {
    workspaces.findById.mockResolvedValue(makeWorkspace());
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(useCase.execute('actor-1', 'ws-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns the root folder once authorized', async () => {
    workspaces.findById.mockResolvedValue(makeWorkspace());
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    const root = makeFolder();
    folders.findWorkspaceRoot.mockResolvedValue(root);

    const result = await useCase.execute('actor-1', 'ws-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'VIEWER',
    );
    expect(folders.findWorkspaceRoot).toHaveBeenCalledWith('ws-1');
    expect(result).toBe(root);
  });

  it('throws NotFoundException if the root folder is somehow missing', async () => {
    workspaces.findById.mockResolvedValue(makeWorkspace());
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    folders.findWorkspaceRoot.mockResolvedValue(null);

    await expect(useCase.execute('actor-1', 'ws-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
