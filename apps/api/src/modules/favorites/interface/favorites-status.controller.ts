import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { CheckFavoritedUseCase } from '../application/check-favorited.use-case';
import { CheckFavoritedQueryDto } from './dto/check-favorited-query.dto';
import { FavoritedIdsResponseDto } from './dto/favorited-ids-response.dto';

/** Separate from FileFavoritesController/FolderFavoritesController (the toggle endpoints) and
 * from SearchModule's GET /favorites (the paginated listing) — this is neither a write nor a
 * paginated list, just a batched existence check scoped to ids the caller already has in hand.
 * No RequirePermission guard: knowing whether the *caller's own* Favorite row exists for an id
 * isn't a permission escalation (same reasoning GET /favorites already relies on), so this is
 * scoped to `user.id` alone. */
@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesStatusController {
  constructor(private readonly checkFavorited: CheckFavoritedUseCase) {}

  @Get('check')
  @ApiOperation({
    summary:
      'Which of the given file/folder ids the caller has favorited — no cap, scoped to exactly the ids requested',
  })
  async check(
    @CurrentUser() user: User,
    @Query() query: CheckFavoritedQueryDto,
  ): Promise<FavoritedIdsResponseDto> {
    const favorited = await this.checkFavorited.execute(
      user.id,
      query.fileIds ?? [],
      query.folderIds ?? [],
    );
    return FavoritedIdsResponseDto.fromDomain(favorited);
  }
}
