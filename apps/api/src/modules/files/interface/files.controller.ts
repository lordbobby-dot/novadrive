import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { GetFileUseCase } from '../application/get-file.use-case';
import { ListFilesByFolderUseCase } from '../application/list-files-by-folder.use-case';
import { RenameFileUseCase } from '../application/rename-file.use-case';
import { CursorPageFileDto } from './dto/cursor-page-file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { RenameFileDto } from './dto/rename-file.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(
    private readonly renameFile: RenameFileUseCase,
    private readonly getFile: GetFileUseCase,
    private readonly listByFolder: ListFilesByFolderUseCase,
  ) {}

  @Get()
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'query',
    field: 'folderId',
  })
  @ApiOperation({ summary: 'List files in a folder (paginated)' })
  async list(
    @CurrentUser() user: User,
    @Query() query: ListFilesQueryDto,
  ): Promise<CursorPageFileDto> {
    const page = await this.listByFolder.execute({
      ownerId: user.id,
      folderId: query.folderId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((file) => FileResponseDto.fromDomain(file)),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':id')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Get a single file' })
  async get(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FileResponseDto> {
    const file = await this.getFile.execute(id, user.id);
    return FileResponseDto.fromDomain(file);
  }

  @Patch(':id/rename')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Rename a file' })
  async rename(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RenameFileDto,
  ): Promise<FileResponseDto> {
    const file = await this.renameFile.execute(id, user.id, dto.name);
    return FileResponseDto.fromDomain(file);
  }
}
