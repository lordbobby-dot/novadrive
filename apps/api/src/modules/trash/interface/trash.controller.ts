import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../../../common/pagination/cursor-pagination.dto';
import type { User } from '../../users/domain/user.entity';
import { ListTrashUseCase } from '../application/list-trash.use-case';
import { PermanentDeleteUseCase } from '../application/permanent-delete.use-case';
import {
  TrashItemResponseDto,
  TrashPageResponseDto,
} from './dto/trash-item-response.dto';

@ApiTags('trash')
@ApiBearerAuth()
@Controller('trash')
export class TrashController {
  constructor(
    private readonly listTrash: ListTrashUseCase,
    private readonly permanentDelete: PermanentDeleteUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List top-level trashed items (a trashed folder counts once, not once per descendant)',
  })
  async list(
    @CurrentUser() user: User,
    @Query() query: CursorPaginationDto,
  ): Promise<TrashPageResponseDto> {
    const page = await this.listTrash.execute({
      ownerId: user.id,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => TrashItemResponseDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Permanently delete a trashed item (and its entire subtree, if a folder) — cannot be undone',
  })
  async deletePermanently(
    @CurrentUser() user: User,
    @Param('id') trashId: string,
  ): Promise<void> {
    await this.permanentDelete.execute(trashId, user.id);
  }
}
