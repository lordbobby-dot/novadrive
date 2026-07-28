import { Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { SetFolderFavoriteUseCase } from '../application/set-folder-favorite.use-case';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
export class FolderFavoritesController {
  constructor(private readonly setFolderFavorite: SetFolderFavoriteUseCase) {}

  @Put(':id/favorite')
  @HttpCode(204)
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Favorite a folder (idempotent)' })
  async add(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    await this.setFolderFavorite.execute(id, user.id, true);
  }

  @Delete(':id/favorite')
  @HttpCode(204)
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Unfavorite a folder (idempotent)' })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.setFolderFavorite.execute(id, user.id, false);
  }
}
