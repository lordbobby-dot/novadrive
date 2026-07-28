import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RenameFolderUseCase } from './rename-folder.use-case';
import type { Folder } from '../domain/folder.entity';
import type { FolderRepository } from '../domain/folder.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Docs',
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

describe('RenameFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: RenameFolderUseCase;

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
    useCase = new RenameFolderUseCase(folders, {
      emit: jest.fn(),
    } as unknown as import('@nestjs/event-emitter').EventEmitter2);
  });

  it("throws NotFoundException when the folder doesn't exist (or isn't owned by the caller)", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute('missing', 'owner-1', 'New name'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to rename the root folder', async () => {
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ parentId: null, path: '/', depth: 0 }),
    );
    await expect(
      useCase.execute('root', 'owner-1', 'New name'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.rename).not.toHaveBeenCalled();
  });

  it('renames a non-root folder', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    folders.rename.mockResolvedValue(makeFolder({ name: 'Renamed' }));

    const result = await useCase.execute('folder-1', 'owner-1', 'Renamed');

    expect(folders.rename).toHaveBeenCalledWith(
      'folder-1',
      'owner-1',
      'Renamed',
    );
    expect(result.name).toBe('Renamed');
  });
});
