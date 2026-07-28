import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { PermanentDeleteFolderUseCase } from './permanent-delete-folder.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { FileVersionRepository } from '../../versions/domain/file-version.repository';
import type { TrashRepository } from '../domain/trash.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { QuotaService } from '../../quota/domain/quota.service';

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

describe('PermanentDeleteFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let trash: jest.Mocked<TrashRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let events: jest.Mocked<EventEmitter2>;
  let quota: jest.Mocked<QuotaService>;
  let useCase: PermanentDeleteFolderUseCase;

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
    versions = {
      listByFile: jest.fn(),
      findByFileAndNumber: jest.fn(),
      create: jest.fn(),
      listStorageObjectIdsForFiles: jest.fn(),
    };
    trash = {
      listRoots: jest.fn(),
      findById: jest.fn(),
      findExpiredRoots: jest.fn(),
      getStorageObjectLocations: jest.fn(),
      deleteStorageObjects: jest.fn(),
    };
    storage = {
      createMultipartUpload: jest.fn(),
      presignUploadParts: jest.fn(),
      completeMultipartUpload: jest.fn(),
      abortMultipartUpload: jest.fn(),
      getObjectStream: jest.fn(),
      deleteObject: jest.fn(),
      presignGetObject: jest.fn(),
      copyObject: jest.fn(),
    };
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    quota = {
      reserve: jest.fn(),
      release: jest.fn(),
      releaseMany: jest.fn(),
    } as unknown as jest.Mocked<QuotaService>;
    useCase = new PermanentDeleteFolderUseCase(
      folders,
      files,
      versions,
      trash,
      storage,
      events,
      quota,
    );
  });

  it("throws NotFoundException when the folder doesn't exist", async () => {
    folders.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cleans up every file in the whole subtree before deleting the folder row', async () => {
    folders.findById.mockResolvedValue(makeFolder());
    folders.findDescendantIds.mockResolvedValue(['folder-2']);
    files.findByFolderIds.mockResolvedValue([
      makeFile({ id: 'file-1' }),
      makeFile({ id: 'file-2', folderId: 'folder-2' }),
    ]);
    versions.listStorageObjectIdsForFiles.mockResolvedValue([
      'storage-1',
      'storage-2',
    ]);
    trash.getStorageObjectLocations.mockResolvedValue([
      {
        id: 'storage-1',
        bucket: 'novadrive-dev',
        objectKey: 'uploads/owner-1/1',
        size: '1024',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      },
      {
        id: 'storage-2',
        bucket: 'novadrive-dev',
        objectKey: 'uploads/owner-1/2',
        size: '2048',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      },
    ]);

    await useCase.execute('folder-1', 'owner-1');

    expect(files.findByFolderIds).toHaveBeenCalledWith(
      ['folder-1', 'folder-2'],
      'owner-1',
    );
    expect(versions.listStorageObjectIdsForFiles).toHaveBeenCalledWith([
      'file-1',
      'file-2',
    ]);
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(trash.deleteStorageObjects).toHaveBeenCalledWith([
      'storage-1',
      'storage-2',
    ]);
    expect(folders.deleteRow).toHaveBeenCalledWith('folder-1');
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'DELETE',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({
          permanent: true,
          folderCount: 2,
          fileCount: 2,
        }),
      }),
    );
    expect(quota.releaseMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'storage-1', size: '1024' }),
      expect.objectContaining({ id: 'storage-2', size: '2048' }),
    ]);
  });

  it('deletes the folder row even when the subtree has no files', async () => {
    folders.findById.mockResolvedValue(makeFolder());
    folders.findDescendantIds.mockResolvedValue([]);
    files.findByFolderIds.mockResolvedValue([]);
    versions.listStorageObjectIdsForFiles.mockResolvedValue([]);
    trash.getStorageObjectLocations.mockResolvedValue([]);

    await useCase.execute('folder-1', 'owner-1');

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(folders.deleteRow).toHaveBeenCalledWith('folder-1');
  });
});
