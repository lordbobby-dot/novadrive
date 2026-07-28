import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { SearchUseCase } from '../application/search.use-case';
import { ListRecentUseCase } from '../application/list-recent.use-case';
import { ListFavoritesUseCase } from '../application/list-favorites.use-case';
import { SearchQueryDto } from './dto/search-query.dto';
import { RecentQueryDto } from './dto/recent-query.dto';
import { FavoritesQueryDto } from './dto/favorites-query.dto';
import {
  SearchResultItemDto,
  SearchResultPageDto,
} from './dto/search-result.dto';

@ApiTags('search')
@ApiBearerAuth()
@Controller()
export class SearchController {
  constructor(
    private readonly searchUseCase: SearchUseCase,
    private readonly listRecentUseCase: ListRecentUseCase,
    private readonly listFavoritesUseCase: ListFavoritesUseCase,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Full-text search across files and folders, ranked by relevance',
  })
  async search(
    @CurrentUser() user: User,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultPageDto> {
    const page = await this.searchUseCase.execute({
      ownerId: user.id,
      q: query.q,
      type: query.type,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      tag: query.tag,
      workspaceId: query.workspaceId,
      owner: query.owner,
      folderId: query.folderId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => SearchResultItemDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get('recent')
  @ApiOperation({
    summary:
      'Recently-accessed files (a download or preview URL was issued), most recent first',
  })
  async recent(
    @CurrentUser() user: User,
    @Query() query: RecentQueryDto,
  ): Promise<SearchResultPageDto> {
    const page = await this.listRecentUseCase.execute({
      ownerId: user.id,
      workspaceId: query.workspaceId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => SearchResultItemDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get('favorites')
  @ApiOperation({
    summary:
      'Files and folders the caller has favorited, most recently favorited first',
  })
  async favorites(
    @CurrentUser() user: User,
    @Query() query: FavoritesQueryDto,
  ): Promise<SearchResultPageDto> {
    const page = await this.listFavoritesUseCase.execute({
      ownerId: user.id,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => SearchResultItemDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }
}
