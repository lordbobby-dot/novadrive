import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { GetFolderTagsUseCase } from '../application/get-folder-tags.use-case';
import { SetFolderTagsUseCase } from '../application/set-folder-tags.use-case';
import { SetTagsDto } from './dto/set-tags.dto';
import { TagResponseDto } from './dto/tag-response.dto';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
export class FolderTagsController {
  constructor(
    private readonly getFolderTags: GetFolderTagsUseCase,
    private readonly setFolderTags: SetFolderTagsUseCase,
  ) {}

  @Get(':id/tags')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: "Get a folder's current tags" })
  async get(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<TagResponseDto[]> {
    const tags = await this.getFolderTags.execute(id, user.id);
    return tags.map((tag) => TagResponseDto.fromDomain(tag));
  }

  @Put(':id/tags')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: "Replace a folder's tag set" })
  async set(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SetTagsDto,
  ): Promise<TagResponseDto[]> {
    const tags = await this.setFolderTags.execute({
      folderId: id,
      ownerId: user.id,
      names: dto.names,
    });
    return tags.map((tag) => TagResponseDto.fromDomain(tag));
  }
}
