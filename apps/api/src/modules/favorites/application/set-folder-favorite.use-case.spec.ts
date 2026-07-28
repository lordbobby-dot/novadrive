import { NotFoundException } from '@nestjs/common';
import { SetFolderFavoriteUseCase } from './set-folder-favorite.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { FavoriteRepository } from '../domain/favorite.repository';

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

describe('SetFolderFavoriteUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let favorites: jest.Mocked<FavoriteRepository>;
  let useCase: SetFolderFavoriteUseCase;

  beforeEach(() => {
    folders = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findRoot: jest.fn(),
      createRoot: jest.fn(),
      createWorkspaceRoot: jest.fn(),
      findWorkspaceRoot: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      findChildren: jest.fn(),
      findDescendantIds: jest.fn(),
      move: jest.fn(),
      softDeleteSubtree: jest.fn(),
      isTrashed: jest.fn(),
      restoreSubtree: jest.fn(),
      deleteRow: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    favorites = {
      addFileFavorite: jest.fn(),
      removeFileFavorite: jest.fn(),
      addFolderFavorite: jest.fn(),
      removeFolderFavorite: jest.fn(),
      isFileFavorited: jest.fn(),
      isFolderFavorited: jest.fn(),
      findFavoritedIds: jest.fn(),
    };
    useCase = new SetFolderFavoriteUseCase(folders, favorites);
  });

  it("throws NotFoundException when the folder doesn't exist", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute('missing', 'owner-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(favorites.addFolderFavorite).not.toHaveBeenCalled();
  });

  it('adds a favorite when favorited=true', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    await useCase.execute('folder-1', 'owner-1', true);
    expect(favorites.addFolderFavorite).toHaveBeenCalledWith(
      'owner-1',
      'folder-1',
    );
    expect(favorites.removeFolderFavorite).not.toHaveBeenCalled();
  });

  it('removes a favorite when favorited=false', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    await useCase.execute('folder-1', 'owner-1', false);
    expect(favorites.removeFolderFavorite).toHaveBeenCalledWith(
      'owner-1',
      'folder-1',
    );
    expect(favorites.addFolderFavorite).not.toHaveBeenCalled();
  });
});
