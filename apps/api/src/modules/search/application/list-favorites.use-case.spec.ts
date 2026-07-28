import { ListFavoritesUseCase } from './list-favorites.use-case';
import type { SearchService } from '../domain/search.service';

describe('ListFavoritesUseCase', () => {
  let search: jest.Mocked<SearchService>;
  let useCase: ListFavoritesUseCase;

  beforeEach(() => {
    search = {
      search: jest.fn(),
      listRecent: jest.fn(),
      listFavorites: jest.fn(),
    };
    useCase = new ListFavoritesUseCase(search);
  });

  it('delegates straight to SearchService.listFavorites (no workspace mode)', async () => {
    const page = { items: [], nextCursor: null };
    search.listFavorites.mockResolvedValue(page);

    const result = await useCase.execute({ ownerId: 'user-1', limit: 20 });

    expect(search.listFavorites).toHaveBeenCalledWith({
      ownerId: 'user-1',
      limit: 20,
    });
    expect(result).toBe(page);
  });
});
