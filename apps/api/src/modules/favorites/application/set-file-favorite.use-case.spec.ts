import { NotFoundException } from '@nestjs/common';
import { SetFileFavoriteUseCase } from './set-file-favorite.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { FavoriteRepository } from '../domain/favorite.repository';

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

describe('SetFileFavoriteUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let favorites: jest.Mocked<FavoriteRepository>;
  let useCase: SetFileFavoriteUseCase;

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
    favorites = {
      addFileFavorite: jest.fn(),
      removeFileFavorite: jest.fn(),
      addFolderFavorite: jest.fn(),
      removeFolderFavorite: jest.fn(),
      isFileFavorited: jest.fn(),
      isFolderFavorited: jest.fn(),
      findFavoritedIds: jest.fn(),
    };
    useCase = new SetFileFavoriteUseCase(files, favorites);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute('missing', 'owner-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(favorites.addFileFavorite).not.toHaveBeenCalled();
  });

  it('adds a favorite when favorited=true', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    await useCase.execute('file-1', 'owner-1', true);
    expect(favorites.addFileFavorite).toHaveBeenCalledWith('owner-1', 'file-1');
    expect(favorites.removeFileFavorite).not.toHaveBeenCalled();
  });

  it('removes a favorite when favorited=false', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    await useCase.execute('file-1', 'owner-1', false);
    expect(favorites.removeFileFavorite).toHaveBeenCalledWith(
      'owner-1',
      'file-1',
    );
    expect(favorites.addFileFavorite).not.toHaveBeenCalled();
  });
});
