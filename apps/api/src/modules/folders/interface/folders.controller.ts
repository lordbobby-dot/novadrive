import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../../../common/pagination/cursor-pagination.dto';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { CreateFolderUseCase } from '../application/create-folder.use-case';
import { GetBreadcrumbUseCase } from '../application/get-breadcrumb.use-case';
import { GetFolderUseCase } from '../application/get-folder.use-case';
import { GetOrCreateRootFolderUseCase } from '../application/get-or-create-root-folder.use-case';
import { ListFolderChildrenUseCase } from '../application/list-folder-children.use-case';
import { RenameFolderUseCase } from '../application/rename-folder.use-case';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CursorPageFolderDto } from './dto/cursor-page-folder.dto';
import { FolderResponseDto } from './dto/folder-response.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
export class FoldersController {
  constructor(
    private readonly getOrCreateRoot: GetOrCreateRootFolderUseCase,
    private readonly createFolder: CreateFolderUseCase,
    private readonly renameFolder: RenameFolderUseCase,
    private readonly listChildren: ListFolderChildrenUseCase,
    private readonly getBreadcrumb: GetBreadcrumbUseCase,
    private readonly getFolder: GetFolderUseCase,
  ) {}

  @Get('root')
  @ApiOperation({
    summary: "Get (or lazily create) the current user's root folder",
  })
  async root(@CurrentUser() user: User): Promise<FolderResponseDto> {
    const folder = await this.getOrCreateRoot.execute(user.id);
    return FolderResponseDto.fromDomain(folder);
  }

  @Post()
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'EDITOR',
    source: 'body',
    field: 'parentId',
  })
  @ApiOperation({ summary: 'Create a subfolder' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.createFolder.execute({
      ownerId: user.id,
      parentId: dto.parentId,
      name: dto.name,
    });
    return FolderResponseDto.fromDomain(folder);
  }

  @Get(':id')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Get a single folder' })
  async get(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.getFolder.execute(id, user.id);
    return FolderResponseDto.fromDomain(folder);
  }

  @Patch(':id/rename')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Rename a folder' })
  async rename(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RenameFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.renameFolder.execute(id, user.id, dto.name);
    return FolderResponseDto.fromDomain(folder);
  }

  @Get(':id/children')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: "List a folder's direct subfolders (paginated)" })
  async children(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() pagination: CursorPaginationDto,
  ): Promise<CursorPageFolderDto> {
    const page = await this.listChildren.execute({
      ownerId: user.id,
      parentId: id,
      cursor: pagination.cursor,
      limit: pagination.limit ?? 20,
    });
    return {
      items: page.items.map((folder) => FolderResponseDto.fromDomain(folder)),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':id/breadcrumb')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({
    summary: 'Get the ancestor chain from root to this folder, inclusive',
  })
  async breadcrumb(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FolderResponseDto[]> {
    const chain = await this.getBreadcrumb.execute(id, user.id);
    return chain.map((folder) => FolderResponseDto.fromDomain(folder));
  }
}
