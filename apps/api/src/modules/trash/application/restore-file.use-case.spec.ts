import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { RestoreFileUseCase } from './restore-file.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-1',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/abc',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
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

describe('RestoreFileUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: RestoreFileUseCase;

  beforeEach(() => {
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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new RestoreFileUseCase(files, folders, events);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restores to the original folder when it is not trashed', async () => {
    files.findById
      .mockResolvedValueOnce(makeFile())
      .mockResolvedValueOnce(makeFile());
    folders.isTrashed.mockResolvedValue(false);

    await useCase.execute('file-1', 'owner-1');

    expect(folders.isTrashed).toHaveBeenCalledWith('folder-1');
    expect(files.move).not.toHaveBeenCalled();
    expect(files.restore).toHaveBeenCalledWith('file-1', 'owner-1');
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'RESTORE',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({ relocatedToRoot: false }),
      }),
    );
  });

  it('relocates to root when the original folder is also trashed', async () => {
    files.findById
      .mockResolvedValueOnce(makeFile())
      .mockResolvedValueOnce(makeFile({ folderId: 'root' }));
    folders.isTrashed.mockResolvedValue(true);
    folders.findRoot.mockResolvedValue(makeFolder());

    await useCase.execute('file-1', 'owner-1');

    expect(files.move).toHaveBeenCalledWith('file-1', 'owner-1', 'root');
    expect(files.restore).toHaveBeenCalledWith('file-1', 'owner-1');
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({ relocatedToRoot: true }),
      }),
    );
  });

  it("throws NotFoundException if the fallback root can't be found", async () => {
    files.findById.mockResolvedValue(makeFile());
    folders.isTrashed.mockResolvedValue(true);
    folders.findRoot.mockResolvedValue(null);

    await expect(useCase.execute('file-1', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(files.restore).not.toHaveBeenCalled();
  });
});
