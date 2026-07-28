import { NotFoundException } from '@nestjs/common';
import { CreateFolderUseCase } from './create-folder.use-case';
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

describe('CreateFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: CreateFolderUseCase;

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
    useCase = new CreateFolderUseCase(folders);
  });

  it("throws NotFoundException when the parent doesn't exist (or isn't owned by the caller)", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({ ownerId: 'owner-1', parentId: 'missing', name: 'New' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives path and depth from the parent', async () => {
    const root = makeFolder({
      id: 'root',
      path: '/',
      depth: 0,
      parentId: null,
    });
    folders.findByIdUnscoped.mockResolvedValue(root);
    folders.create.mockResolvedValue(
      makeFolder({ id: 'child', parentId: 'root' }),
    );

    await useCase.execute({
      ownerId: 'owner-1',
      parentId: 'root',
      name: 'Photos',
    });

    expect(folders.create).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      parentId: 'root',
      name: 'Photos',
      path: '/root/',
      depth: 1,
      organizationId: null,
      workspaceId: null,
    });
  });

  it('inherits organizationId/workspaceId from a workspace-scoped parent', async () => {
    const parent = makeFolder({
      id: 'ws-root',
      path: '/',
      depth: 0,
      organizationId: 'org-1',
      workspaceId: 'ws-1',
    });
    folders.findByIdUnscoped.mockResolvedValue(parent);
    folders.create.mockResolvedValue(makeFolder({ id: 'child' }));

    await useCase.execute({
      ownerId: 'owner-1',
      parentId: 'ws-root',
      name: 'Reports',
    });

    expect(folders.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', workspaceId: 'ws-1' }),
    );
  });

  it('computes multi-level nested paths correctly', async () => {
    const parent = makeFolder({
      id: 'child',
      path: '/root/',
      depth: 1,
      parentId: 'root',
    });
    folders.findByIdUnscoped.mockResolvedValue(parent);
    folders.create.mockResolvedValue(
      makeFolder({ id: 'grandchild', parentId: 'child' }),
    );

    await useCase.execute({
      ownerId: 'owner-1',
      parentId: 'child',
      name: '2026',
    });

    expect(folders.create).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/root/child/', depth: 2 }),
    );
  });
});
