import { NotFoundException } from '@nestjs/common';
import { RenameFileUseCase } from './rename-file.use-case';
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
    objectKey: 'stub/owner-1/abc',
    region: 'ap-south-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RenameFileUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let useCase: RenameFileUseCase;

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
    useCase = new RenameFileUseCase(files, {
      emit: jest.fn(),
    } as unknown as import('@nestjs/event-emitter').EventEmitter2);
  });

  it("throws NotFoundException when the file doesn't exist (or isn't owned by the caller)", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute('missing', 'owner-1', 'New name'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renames the file', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    files.rename.mockResolvedValue(makeFile({ name: 'Renamed' }));

    const result = await useCase.execute('file-1', 'owner-1', 'Renamed');

    expect(files.rename).toHaveBeenCalledWith('file-1', 'owner-1', 'Renamed');
    expect(result.name).toBe('Renamed');
  });
});
