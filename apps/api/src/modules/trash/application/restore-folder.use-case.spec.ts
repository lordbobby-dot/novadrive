import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { RestoreFolderUseCase } from './restore-folder.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { FileRepository } from '../../files/domain/file.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Documents',
    ownerId: 'owner-1',
    parentId: 'parent-1',
    path: '/parent-1/',
    depth: 1,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRoot(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'root',
    name: 'My Drive',
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

describe('RestoreFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: RestoreFolderUseCase;

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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new RestoreFolderUseCase(folders, files, events);
  });

  it("throws NotFoundException when the folder doesn't exist", async () => {
    folders.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restores in place (with the whole subtree) when the parent is not trashed', async () => {
    folders.findById
      .mockResolvedValueOnce(makeFolder())
      .mockResolvedValueOnce(makeFolder());
    folders.isTrashed.mockResolvedValue(false);
    folders.restoreSubtree.mockResolvedValue(['folder-1', 'folder-2']);
    files.restoreByFolderIds.mockResolvedValue(3);

    await useCase.execute('folder-1', 'owner-1');

    expect(folders.move).not.toHaveBeenCalled();
    expect(folders.restoreSubtree).toHaveBeenCalledWith('folder-1', 'owner-1');
    expect(files.restoreByFolderIds).toHaveBeenCalledWith(
      ['folder-1', 'folder-2'],
      'owner-1',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({
          relocatedToRoot: false,
          restoredFolderCount: 2,
        }),
      }),
    );
  });

  it('relocates to root when the original parent is also trashed', async () => {
    folders.findById
      .mockResolvedValueOnce(makeFolder())
      .mockResolvedValueOnce(makeFolder({ parentId: 'root', path: '/root/' }));
    folders.isTrashed.mockResolvedValue(true);
    folders.findRoot.mockResolvedValue(makeRoot());
    folders.restoreSubtree.mockResolvedValue(['folder-1']);
    files.restoreByFolderIds.mockResolvedValue(0);

    await useCase.execute('folder-1', 'owner-1');

    expect(folders.move).toHaveBeenCalledWith({
      id: 'folder-1',
      ownerId: 'owner-1',
      newParentId: 'root',
      newPath: '/root/',
      newDepth: 1,
    });
    expect(folders.restoreSubtree).toHaveBeenCalledWith('folder-1', 'owner-1');
  });

  it('never treats a root folder (no parentId) as having a trashed parent', async () => {
    folders.findById
      .mockResolvedValueOnce(makeRoot())
      .mockResolvedValueOnce(makeRoot());
    folders.restoreSubtree.mockResolvedValue(['root']);
    files.restoreByFolderIds.mockResolvedValue(0);

    await useCase.execute('root', 'owner-1');

    expect(folders.isTrashed).not.toHaveBeenCalled();
    expect(folders.move).not.toHaveBeenCalled();
  });

  it("throws NotFoundException if the fallback root can't be found", async () => {
    folders.findById.mockResolvedValue(makeFolder());
    folders.isTrashed.mockResolvedValue(true);
    folders.findRoot.mockResolvedValue(null);

    await expect(useCase.execute('folder-1', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(folders.restoreSubtree).not.toHaveBeenCalled();
  });
});
