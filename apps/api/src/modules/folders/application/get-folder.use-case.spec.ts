import { NotFoundException } from '@nestjs/common';
import { GetFolderUseCase } from './get-folder.use-case';
import type { Folder } from '../domain/folder.entity';
import type { FolderRepository } from '../domain/folder.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Docs',
    ownerId: 'owner-1',
    parentId: null,
    path: '/',
    depth: 0,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GetFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: GetFolderUseCase;

  beforeEach(() => {
    folders = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findRoot: jest.fn(),
      createRoot: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      findChildren: jest.fn(),
      findDescendantIds: jest.fn(),
      move: jest.fn(),
      softDeleteSubtree: jest.fn(),
      isTrashed: jest.fn(),
      restoreSubtree: jest.fn(),
      deleteRow: jest.fn(),
      createWorkspaceRoot: jest.fn(),
      findWorkspaceRoot: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    useCase = new GetFolderUseCase(folders);
  });

  it("throws NotFoundException when the folder doesn't exist", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the folder via the unscoped lookup — PermissionGuard has already authorized the caller, who may be a collaborator, not the owner', async () => {
    const folder = makeFolder();
    folders.findByIdUnscoped.mockResolvedValue(folder);

    const result = await useCase.execute('folder-1', 'someone-else');

    expect(folders.findByIdUnscoped).toHaveBeenCalledWith('folder-1');
    expect(result).toBe(folder);
  });
});
