import { NotFoundException } from '@nestjs/common';
import { ListFilesByFolderUseCase } from './list-files-by-folder.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { File } from '../domain/file.entity';
import type { FileRepository } from '../domain/file.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Docs',
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

describe('ListFilesByFolderUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let useCase: ListFilesByFolderUseCase;

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
    useCase = new ListFilesByFolderUseCase(files, folders);
  });

  it("throws NotFoundException when the folder doesn't exist (or isn't owned by the caller)", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({ ownerId: 'owner-1', folderId: 'missing', limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives nextCursor from the lookahead row when there are more results', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    files.findByFolder.mockResolvedValue([
      makeFile({ id: 'a' }),
      makeFile({ id: 'b' }),
      makeFile({ id: 'c' }),
    ]);

    const page = await useCase.execute({
      ownerId: 'owner-1',
      folderId: 'folder-1',
      limit: 2,
    });

    expect(page.items.map((f) => f.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('b');
  });
});
