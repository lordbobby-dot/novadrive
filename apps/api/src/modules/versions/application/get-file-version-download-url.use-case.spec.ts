import { NotFoundException } from '@nestjs/common';
import { GetFileVersionDownloadUrlUseCase } from './get-file-version-download-url.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { FileVersion } from '../domain/file-version.entity';
import type { FileVersionRepository } from '../domain/file-version.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';

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

function makeVersion(overrides: Partial<FileVersion> = {}): FileVersion {
  return {
    id: 'version-1',
    fileId: 'file-1',
    storageObjectId: 'storage-old',
    versionNumber: 1,
    createdBy: 'owner-1',
    changeNote: null,
    createdAt: new Date(),
    contentType: 'application/pdf',
    size: '512',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/v1',
    region: 'us-east-1',
    ...overrides,
  };
}

describe('GetFileVersionDownloadUrlUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let useCase: GetFileVersionDownloadUrlUseCase;

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
    useCase = new GetFileVersionDownloadUrlUseCase(files, versions, storage);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute('missing', 'actor-1', 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(versions.findByFileAndNumber).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when that version number doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    versions.findByFileAndNumber.mockResolvedValue(null);
    await expect(
      useCase.execute('file-1', 'actor-1', 99),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.presignGetObject).not.toHaveBeenCalled();
  });

  it("presigns a download for the version's own bucket/objectKey, not the file's current one", async () => {
    const file = makeFile();
    const version = makeVersion();
    files.findByIdUnscoped.mockResolvedValue(file);
    versions.findByFileAndNumber.mockResolvedValue(version);
    storage.presignGetObject.mockResolvedValue({
      url: 'https://signed.example/version',
      expiresAt: new Date('2026-01-01'),
    });

    const result = await useCase.execute('file-1', 'actor-1', 1);

    expect(versions.findByFileAndNumber).toHaveBeenCalledWith('file-1', 1);
    expect(storage.presignGetObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: version.bucket,
        objectKey: version.objectKey,
        disposition: 'attachment',
        fileName: file.name,
        contentType: version.contentType,
      }),
    );
    expect(result).toEqual({
      url: 'https://signed.example/version',
      expiresAt: new Date('2026-01-01'),
      fileName: file.name,
      contentType: version.contentType,
      size: version.size,
    });
  });
});
