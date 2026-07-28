import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { MoveFileUseCase } from './move-file.use-case';
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
    objectKey: 'uploads/owner-1/existing',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-2',
    name: 'Target',
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

describe('MoveFileUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: MoveFileUseCase;

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
    useCase = new MoveFileUseCase(files, folders, events);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        id: 'missing',
        actorId: 'owner-1',
        targetFolderId: 'folder-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(folders.findByIdUnscoped).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the target folder doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        id: 'file-1',
        actorId: 'owner-1',
        targetFolderId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(files.move).not.toHaveBeenCalled();
  });

  it('moves the file and emits an activity event carrying the from/to folder ids', async () => {
    files.findByIdUnscoped.mockResolvedValue(
      makeFile({ folderId: 'folder-1' }),
    );
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    const moved = makeFile({ folderId: 'folder-2' });
    files.move.mockResolvedValue(moved);

    const result = await useCase.execute({
      id: 'file-1',
      actorId: 'owner-1',
      targetFolderId: 'folder-2',
    });

    expect(files.move).toHaveBeenCalledWith('file-1', 'owner-1', 'folder-2');
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'MOVE',
        targetType: 'FILE',
        targetId: 'file-1',
        metadata: {
          name: 'report.pdf',
          fromFolderId: 'folder-1',
          toFolderId: 'folder-2',
        },
      }),
    );
    expect(result).toBe(moved);
  });
});
