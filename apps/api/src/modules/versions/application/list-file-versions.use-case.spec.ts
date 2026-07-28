import { NotFoundException } from '@nestjs/common';
import { ListFileVersionsUseCase } from './list-file-versions.use-case';
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
    storageObjectId: 'storage-current',
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

describe('ListFileVersionsUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let useCase: ListFileVersionsUseCase;

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
    useCase = new ListFileVersionsUseCase(files, versions);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns the version list alongside the file's current storageObjectId, independent of the highest version number", async () => {
    files.findByIdUnscoped.mockResolvedValue(
      makeFile({ storageObjectId: 'storage-current' }),
    );
    const list: FileVersion[] = [
      {
        id: 'v2',
        fileId: 'file-1',
        storageObjectId: 'storage-newest',
        versionNumber: 2,
        createdBy: 'owner-1',
        changeNote: null,
        createdAt: new Date(),
        contentType: 'application/pdf',
        size: '2048',
        bucket: 'novadrive-dev',
        objectKey: 'uploads/owner-1/v2',
        region: 'us-east-1',
      },
    ];
    versions.listByFile.mockResolvedValue(list);

    const result = await useCase.execute('file-1', 'actor-1');

    expect(versions.listByFile).toHaveBeenCalledWith('file-1');
    // The current pointer comes from the File row, not from whichever version has the highest
    // versionNumber — restoring an older version moves the pointer backward without renumbering.
    expect(result).toEqual({
      versions: list,
      currentStorageObjectId: 'storage-current',
    });
  });
});
