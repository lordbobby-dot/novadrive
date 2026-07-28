import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { RestoreFileVersionUseCase } from './restore-file-version.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { FileVersion } from '../domain/file-version.entity';
import type { FileVersionRepository } from '../domain/file-version.repository';

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-v2',
    contentType: 'application/pdf',
    size: '2048',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/v2',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeVersion(overrides: Partial<FileVersion> = {}): FileVersion {
  return {
    id: 'version-1',
    fileId: 'file-1',
    storageObjectId: 'storage-v1',
    versionNumber: 1,
    createdBy: 'owner-1',
    changeNote: null,
    createdAt: new Date(),
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/v1',
    region: 'us-east-1',
    ...overrides,
  };
}

describe('RestoreFileVersionUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: RestoreFileVersionUseCase;

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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new RestoreFileVersionUseCase(files, versions, events);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute('missing', 'owner-1', 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when the version doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    versions.findByFileAndNumber.mockResolvedValue(null);
    await expect(
      useCase.execute('file-1', 'owner-1', 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('moves the current pointer back without creating or deleting any version row', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    versions.findByFileAndNumber.mockResolvedValue(makeVersion());
    files.updateCurrentStorageObject.mockResolvedValue(
      makeFile({ storageObjectId: 'storage-v1' }),
    );

    const result = await useCase.execute('file-1', 'owner-1', 1);

    expect(versions.findByFileAndNumber).toHaveBeenCalledWith('file-1', 1);
    expect(files.updateCurrentStorageObject).toHaveBeenCalledWith(
      'file-1',
      'owner-1',
      'storage-v1',
    );
    expect(versions.create).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'VERSION_RESTORE',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({ restoredVersionNumber: 1 }),
      }),
    );
    expect(result.storageObjectId).toBe('storage-v1');
  });
});
