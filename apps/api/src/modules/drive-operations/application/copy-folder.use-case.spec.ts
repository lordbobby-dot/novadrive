import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CopyFolderUseCase } from './copy-folder.use-case';
import { CopyFileUseCase } from './copy-file.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { FileRepository } from '../../files/domain/file.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Documents',
    ownerId: 'owner-1',
    parentId: 'root',
    path: '/root/',
    depth: 1,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CopyFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let copyFile: jest.Mocked<CopyFileUseCase>;
  let useCase: CopyFolderUseCase;

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
    files = {
      findById: jest.fn(),
      create: jest.fn(),
      createFromStorageObject: jest.fn(),
      rename: jest.fn(),
      findByFolder: jest.fn(),
      move: jest.fn(),
      copyToNewStorageObject: jest.fn(),
      softDelete: jest.fn(),
      softDeleteByFolderIds: jest.fn(),
      restore: jest.fn(),
      restoreByFolderIds: jest.fn(),
      findByFolderIds: jest.fn(),
      updateCurrentStorageObject: jest.fn(),
      touchLastAccessed: jest.fn(),
      isTrashed: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    copyFile = { copy: jest.fn() } as unknown as jest.Mocked<CopyFileUseCase>;
    useCase = new CopyFolderUseCase(folders, files, copyFile, {
      emit: jest.fn(),
    } as unknown as import('@nestjs/event-emitter').EventEmitter2);
  });

  it("throws NotFoundException when the source folder doesn't exist", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        id: 'missing',
        ownerId: 'owner-1',
        targetParentId: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects copying a folder into itself', async () => {
    const folder = makeFolder({ id: 'folder-1' });
    folders.findByIdUnscoped.mockImplementation((id) =>
      Promise.resolve(id === 'folder-1' ? folder : null),
    );
    await expect(
      useCase.execute({
        id: 'folder-1',
        ownerId: 'owner-1',
        targetParentId: 'folder-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.create).not.toHaveBeenCalled();
  });

  it('rejects copying a folder into its own descendant', async () => {
    const folder = makeFolder({ id: 'folder-1', path: '/root/' });
    const descendant = makeFolder({ id: 'child', path: '/root/folder-1/' });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(folder);
      if (id === 'child') return Promise.resolve(descendant);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        id: 'folder-1',
        ownerId: 'owner-1',
        targetParentId: 'child',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.create).not.toHaveBeenCalled();
  });

  it('creates the copy under the target parent with a new path/depth, defaulting the name to the source name', async () => {
    const source = makeFolder({
      id: 'folder-1',
      name: 'Documents',
      path: '/root/',
    });
    const targetParent = makeFolder({
      id: 'other',
      path: '/root/x/',
      depth: 2,
    });
    const created = makeFolder({
      id: 'new-folder',
      name: 'Documents',
      parentId: 'other',
    });

    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(source);
      if (id === 'other') return Promise.resolve(targetParent);
      return Promise.resolve(null);
    });
    folders.create.mockResolvedValue(created);
    files.findByFolder.mockResolvedValue([]);
    folders.findChildren.mockResolvedValue([]);

    const result = await useCase.execute({
      id: 'folder-1',
      ownerId: 'owner-1',
      targetParentId: 'other',
    });

    expect(folders.create).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      parentId: 'other',
      name: 'Documents',
      path: '/root/x/other/',
      depth: 3,
      organizationId: null,
      workspaceId: null,
    });
    expect(result).toBe(created);
  });

  it('inherits organizationId/workspaceId from the destination when copying into a workspace', async () => {
    const source = makeFolder({ id: 'folder-1', path: '/root/' });
    const wsRoot = makeFolder({
      id: 'ws-root',
      path: '/',
      depth: 0,
      organizationId: 'org-1',
      workspaceId: 'ws-1',
    });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(source);
      if (id === 'ws-root') return Promise.resolve(wsRoot);
      return Promise.resolve(null);
    });
    folders.create.mockResolvedValue(makeFolder({ id: 'copy' }));
    files.findByFolder.mockResolvedValue([]);
    folders.findChildren.mockResolvedValue([]);

    await useCase.execute({
      id: 'folder-1',
      ownerId: 'owner-1',
      targetParentId: 'ws-root',
    });

    expect(folders.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', workspaceId: 'ws-1' }),
    );
  });
});
