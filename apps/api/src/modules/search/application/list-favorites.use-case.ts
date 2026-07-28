import { Inject, Injectable } from '@nestjs/common';
import { SearchResultPage } from '../domain/search-result.entity';
import {
  FavoritesQuery,
  SEARCH_SERVICE,
  type SearchService,
} from '../domain/search.service';

/** No workspace mode — favorites are always personal (see FavoritesQuery), so unlike
 * SearchUseCase/ListRecentUseCase there's no org-role check to perform here. */
@Injectable()
export class ListFavoritesUseCase {
  constructor(@Inject(SEARCH_SERVICE) private readonly search: SearchService) {}

  async execute(query: FavoritesQuery): Promise<SearchResultPage> {
    return this.search.listFavorites(query);
  }
}
