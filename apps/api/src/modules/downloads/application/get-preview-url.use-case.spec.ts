import { NotFoundException } from '@nestjs/common';
import { GetPreviewUrlUseCase } from './get-preview-url.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'photo.jpg',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-1',
    contentType: 'image/jpeg',
    size: '2048',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/xyz',
    region: 'ap-south-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GetPreviewUrlUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let useCase: GetPreviewUrlUseCase;

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
    useCase = new GetPreviewUrlUseCase(files, storage);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.presignGetObject).not.toHaveBeenCalled();
  });

  it('presigns a GET URL with an inline disposition', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    const expiresAt = new Date('2026-01-01T00:05:00.000Z');
    storage.presignGetObject.mockResolvedValue({
      url: 'https://s3.example/signed-inline',
      expiresAt,
    });

    const result = await useCase.execute('file-1', 'owner-1');

    expect(files.findByIdUnscoped).toHaveBeenCalledWith('file-1');
    expect(storage.presignGetObject).toHaveBeenCalledWith({
      bucket: 'novadrive-dev',
      objectKey: 'uploads/owner-1/xyz',
      disposition: 'inline',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
    });
    expect(result).toEqual({
      url: 'https://s3.example/signed-inline',
      expiresAt,
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      size: '2048',
    });
    expect(files.touchLastAccessed).toHaveBeenCalledWith('file-1');
  });
});
