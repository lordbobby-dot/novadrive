import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { AddFileVersionUseCase } from './add-file-version.use-case';
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
    storageObjectId: 'storage-old',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/old',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeVersion(overrides: Partial<FileVersion> = {}): FileVersion {
  return {
    id: 'version-2',
    fileId: 'file-1',
    storageObjectId: 'storage-new',
    versionNumber: 2,
    createdBy: 'owner-1',
    changeNote: null,
    createdAt: new Date(),
    contentType: 'application/pdf',
    size: '2048',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/new',
    region: 'us-east-1',
    ...overrides,
  };
}

describe('AddFileVersionUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: AddFileVersionUseCase;

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
    useCase = new AddFileVersionUseCase(files, versions, events);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        fileId: 'missing',
        ownerId: 'owner-1',
        storageObjectId: 'storage-new',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates the version and rewrites the current storage-object pointer', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    versions.create.mockResolvedValue(makeVersion());

    const result = await useCase.execute({
      fileId: 'file-1',
      ownerId: 'owner-1',
      storageObjectId: 'storage-new',
    });

    expect(versions.create).toHaveBeenCalledWith({
      fileId: 'file-1',
      storageObjectId: 'storage-new',
      createdBy: 'owner-1',
      changeNote: undefined,
    });
    expect(files.updateCurrentStorageObject).toHaveBeenCalledWith(
      'file-1',
      'owner-1',
      'storage-new',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        action: 'UPLOAD',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- nested expect.objectContaining()
        metadata: expect.objectContaining({ versionNumber: 2 }),
      }),
    );
    expect(result.versionNumber).toBe(2);
  });
});
