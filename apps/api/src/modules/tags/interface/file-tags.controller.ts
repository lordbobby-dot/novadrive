import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { GetFileTagsUseCase } from '../application/get-file-tags.use-case';
import { SetFileTagsUseCase } from '../application/set-file-tags.use-case';
import { SetTagsDto } from './dto/set-tags.dto';
import { TagResponseDto } from './dto/tag-response.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FileTagsController {
  constructor(
    private readonly getFileTags: GetFileTagsUseCase,
    private readonly setFileTags: SetFileTagsUseCase,
  ) {}

  @Get(':id/tags')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: "Get a file's current tags" })
  async get(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<TagResponseDto[]> {
    const tags = await this.getFileTags.execute(id, user.id);
    return tags.map((tag) => TagResponseDto.fromDomain(tag));
  }

  @Put(':id/tags')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: "Replace a file's tag set" })
  async set(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SetTagsDto,
  ): Promise<TagResponseDto[]> {
    const tags = await this.setFileTags.execute({
      fileId: id,
      ownerId: user.id,
      names: dto.names,
    });
    return tags.map((tag) => TagResponseDto.fromDomain(tag));
  }
}
