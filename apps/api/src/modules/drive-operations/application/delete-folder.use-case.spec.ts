import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeleteFolderUseCase } from './delete-folder.use-case';
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

describe('DeleteFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let useCase: DeleteFolderUseCase;

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
    useCase = new DeleteFolderUseCase(folders, files, {
      emit: jest.fn(),
    } as unknown as import('@nestjs/event-emitter').EventEmitter2);
  });

  it("throws NotFoundException when the folder doesn't exist", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to delete the root folder', async () => {
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ id: 'root', parentId: null }),
    );
    await expect(useCase.execute('root', 'owner-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(folders.softDeleteSubtree).not.toHaveBeenCalled();
  });

  it('trashes the folder subtree in one batched call, then the files inside it in another', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    folders.softDeleteSubtree.mockResolvedValue([
      'folder-1',
      'child-1',
      'child-2',
    ]);
    files.softDeleteByFolderIds.mockResolvedValue(1234);

    const result = await useCase.execute('folder-1', 'owner-1');

    // One call for the whole subtree, not one per descendant — that's the "batched, not N+1"
    // requirement this use case exists to satisfy for the 1000+-descendant acceptance criterion.
    expect(folders.softDeleteSubtree).toHaveBeenCalledTimes(1);
    expect(folders.softDeleteSubtree).toHaveBeenCalledWith(
      'folder-1',
      'owner-1',
    );
    expect(files.softDeleteByFolderIds).toHaveBeenCalledTimes(1);
    expect(files.softDeleteByFolderIds).toHaveBeenCalledWith(
      ['folder-1', 'child-1', 'child-2'],
      'owner-1',
    );
    expect(result).toEqual({ trashedFolders: 3, trashedFiles: 1234 });
  });

  it("files the trashed subtree under the folder's own owner, not the deleting actor", async () => {
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ ownerId: 'real-owner' }),
    );
    folders.softDeleteSubtree.mockResolvedValue(['folder-1']);
    files.softDeleteByFolderIds.mockResolvedValue(0);

    await useCase.execute('folder-1', 'collaborator-1');

    expect(folders.softDeleteSubtree).toHaveBeenCalledWith(
      'folder-1',
      'real-owner',
    );
    expect(files.softDeleteByFolderIds).toHaveBeenCalledWith(
      ['folder-1'],
      'real-owner',
    );
  });
});
