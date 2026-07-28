import { NotFoundException } from '@nestjs/common';
import { GetFileUseCase } from './get-file.use-case';
import type { File } from '../domain/file.entity';
import type { FileRepository } from '../domain/file.repository';

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

describe('GetFileUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let useCase: GetFileUseCase;

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
    useCase = new GetFileUseCase(files);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the file via the unscoped lookup — PermissionGuard has already authorized the caller, who may be a collaborator, not the owner', async () => {
    const file = makeFile();
    files.findByIdUnscoped.mockResolvedValue(file);

    const result = await useCase.execute('file-1', 'someone-else');

    expect(files.findByIdUnscoped).toHaveBeenCalledWith('file-1');
    expect(result).toBe(file);
  });
});
