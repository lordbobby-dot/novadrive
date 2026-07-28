import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { PermanentDeleteFileUseCase } from './permanent-delete-file.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { FileVersionRepository } from '../../versions/domain/file-version.repository';
import type { TrashRepository } from '../domain/trash.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { QuotaService } from '../../quota/domain/quota.service';

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-current',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/current',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PermanentDeleteFileUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let trash: jest.Mocked<TrashRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let events: jest.Mocked<EventEmitter2>;
  let quota: jest.Mocked<QuotaService>;
  let useCase: PermanentDeleteFileUseCase;

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
    useCase = new PermanentDeleteFileUseCase(
      files,
      versions,
      trash,
      storage,
      events,
      quota,
    );
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes every historical StorageObject from S3 and Postgres, not just the current one', async () => {
    files.findById.mockResolvedValue(makeFile());
    versions.listStorageObjectIdsForFiles.mockResolvedValue([
      'storage-v1',
      'storage-v2',
      'storage-current',
    ]);
    trash.getStorageObjectLocations.mockResolvedValue([
      {
        id: 'storage-v1',
        bucket: 'novadrive-dev',
        objectKey: 'uploads/owner-1/v1',
        size: '100',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      },
      {
        id: 'storage-v2',
        bucket: 'novadrive-dev',
        objectKey: 'uploads/owner-1/v2',
        size: '200',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      },
      {
        id: 'storage-current',
        bucket: 'novadrive-dev',
        objectKey: 'uploads/owner-1/current',
        size: '300',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      },
    ]);

    await useCase.execute('file-1', 'owner-1');

    expect(versions.listStorageObjectIdsForFiles).toHaveBeenCalledWith([
      'file-1',
    ]);
    expect(storage.deleteObject).toHaveBeenCalledTimes(3);
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'novadrive-dev',
      objectKey: 'uploads/owner-1/v1',
    });
    expect(trash.deleteStorageObjects).toHaveBeenCalledWith([
      'storage-v1',
      'storage-v2',
      'storage-current',
    ]);
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'DELETE',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({ permanent: true }),
      }),
    );
    expect(quota.releaseMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'storage-v1', size: '100' }),
      expect.objectContaining({ id: 'storage-v2', size: '200' }),
      expect.objectContaining({ id: 'storage-current', size: '300' }),
    ]);
  });
});
