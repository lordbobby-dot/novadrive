import { Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { SetFileFavoriteUseCase } from '../application/set-file-favorite.use-case';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FileFavoritesController {
  constructor(private readonly setFileFavorite: SetFileFavoriteUseCase) {}

  @Put(':id/favorite')
  @HttpCode(204)
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Favorite a file (idempotent)' })
  async add(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    await this.setFileFavorite.execute(id, user.id, true);
  }

  @Delete(':id/favorite')
  @HttpCode(204)
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Unfavorite a file (idempotent)' })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.setFileFavorite.execute(id, user.id, false);
  }
}
