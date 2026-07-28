import { CheckFavoritedUseCase } from './check-favorited.use-case';
import type { FavoriteRepository } from '../domain/favorite.repository';

describe('CheckFavoritedUseCase', () => {
  let favorites: jest.Mocked<FavoriteRepository>;
  let useCase: CheckFavoritedUseCase;

  beforeEach(() => {
    favorites = {
      addFileFavorite: jest.fn(),
      removeFileFavorite: jest.fn(),
      addFolderFavorite: jest.fn(),
      removeFolderFavorite: jest.fn(),
      isFileFavorited: jest.fn(),
      isFolderFavorited: jest.fn(),
      findFavoritedIds: jest.fn(),
    };
    useCase = new CheckFavoritedUseCase(favorites);
  });

  it('returns empty results without querying the repository when both id lists are empty', async () => {
    const result = await useCase.execute('owner-1', [], []);

    expect(result).toEqual({ fileIds: [], folderIds: [] });
    expect(favorites.findFavoritedIds).not.toHaveBeenCalled();
  });

  it('delegates to the repository with the given ids, scoped to the owner', async () => {
    favorites.findFavoritedIds.mockResolvedValue({
      fileIds: ['file-1'],
      folderIds: [],
    });

    const result = await useCase.execute(
      'owner-1',
      ['file-1', 'file-2'],
      ['folder-1'],
    );

    expect(favorites.findFavoritedIds).toHaveBeenCalledWith('owner-1', {
      fileIds: ['file-1', 'file-2'],
      folderIds: ['folder-1'],
    });
    expect(result).toEqual({ fileIds: ['file-1'], folderIds: [] });
  });

  it('is not limited by any count — the repository decides what comes back, no cap applied here', async () => {
    const manyIds = Array.from({ length: 150 }, (_, i) => `file-${i}`);
    favorites.findFavoritedIds.mockResolvedValue({
      fileIds: manyIds,
      folderIds: [],
    });

    const result = await useCase.execute('owner-1', manyIds, []);

    expect(result.fileIds).toHaveLength(150);
  });
});
