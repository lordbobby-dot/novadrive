import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { User } from '../../users/domain/user.entity';
import type { ResourceTypeName } from '../domain/permission.entity';
import { CreateSharedLinkUseCase } from '../application/create-shared-link.use-case';
import { GetSharedLinkUseCase } from '../application/get-shared-link.use-case';
import { DownloadViaSharedLinkUseCase } from '../application/download-via-shared-link.use-case';
import { RevokeSharedLinkUseCase } from '../application/revoke-shared-link.use-case';
import { ListSharedLinksForResourceUseCase } from '../application/list-shared-links-for-resource.use-case';
import { ListSharedFolderSubfoldersUseCase } from '../application/list-shared-folder-subfolders.use-case';
import { ListSharedFolderFilesUseCase } from '../application/list-shared-folder-files.use-case';
import { GetSharedFolderBreadcrumbUseCase } from '../application/get-shared-folder-breadcrumb.use-case';
import { CreateSharedLinkDto } from './dto/create-shared-link.dto';
import { SharedLinkResponseDto } from './dto/shared-link-response.dto';
import { SharedLinkAccessResponseDto } from './dto/shared-link-access-response.dto';
import { SharedLinkDownloadDto } from './dto/shared-link-download.dto';
import { BrowseSharedFolderQueryDto } from './dto/browse-shared-folder-query.dto';
import { SharedFolderBreadcrumbQueryDto } from './dto/shared-folder-breadcrumb-query.dto';
import { CursorPageSharedFolderDto } from './dto/cursor-page-shared-folder.dto';
import { CursorPageSharedFileDto } from './dto/cursor-page-shared-file.dto';
import { SharedFolderItemResponseDto } from './dto/shared-folder-item-response.dto';
import { SharedFileItemResponseDto } from './dto/shared-file-item-response.dto';

@ApiTags('shared-links')
@Controller()
export class SharedLinksController {
  constructor(
    private readonly createSharedLink: CreateSharedLinkUseCase,
    private readonly getSharedLink: GetSharedLinkUseCase,
    private readonly downloadViaSharedLink: DownloadViaSharedLinkUseCase,
    private readonly revokeSharedLink: RevokeSharedLinkUseCase,
    private readonly listSharedLinks: ListSharedLinksForResourceUseCase,
    private readonly listSharedFolderSubfolders: ListSharedFolderSubfoldersUseCase,
    private readonly listSharedFolderFiles: ListSharedFolderFilesUseCase,
    private readonly getSharedFolderBreadcrumb: GetSharedFolderBreadcrumbUseCase,
  ) {}

  @Post('shared-links')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a public/token-based link to a file or folder',
  })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateSharedLinkDto,
  ): Promise<SharedLinkResponseDto> {
    const link = await this.createSharedLink.execute({
      ownerId: user.id,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      password: dto.password,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      maxDownloads: dto.maxDownloads,
      canView: dto.canView,
      canDownload: dto.canDownload,
      canComment: dto.canComment,
      canEdit: dto.canEdit,
      visibility: dto.visibility,
    });
    return SharedLinkResponseDto.fromDomain(link);
  }

  @Get('shared-links/:token')
  @Public()
  // Public, unauthenticated, and password-gated — the endpoint a password-brute-force attempt
  // targets, so it's tightened well below the general API default (see app.module.ts).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Public, unauthenticated: resolve a share token to resource metadata',
  })
  async access(
    @Param('token') token: string,
    @Query('password') password?: string,
  ): Promise<SharedLinkAccessResponseDto> {
    const result = await this.getSharedLink.execute(token, password);
    return SharedLinkAccessResponseDto.fromResult(result);
  }

  @Get('shared-links/:token/folders')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Public, unauthenticated: list a shared folder's direct subfolders (paginated) — folderId defaults to the link's own root, or any of its descendants",
  })
  async browseFolders(
    @Param('token') token: string,
    @Query() query: BrowseSharedFolderQueryDto,
  ): Promise<CursorPageSharedFolderDto> {
    const page = await this.listSharedFolderSubfolders.execute({
      token,
      password: query.password,
      folderId: query.folderId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((folder) =>
        SharedFolderItemResponseDto.fromDomain(folder),
      ),
      nextCursor: page.nextCursor,
    };
  }

  @Get('shared-links/:token/files')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Public, unauthenticated: list a shared folder's direct files (paginated) — same folderId rules as .../folders",
  })
  async browseFiles(
    @Param('token') token: string,
    @Query() query: BrowseSharedFolderQueryDto,
  ): Promise<CursorPageSharedFileDto> {
    const page = await this.listSharedFolderFiles.execute({
      token,
      password: query.password,
      folderId: query.folderId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((file) =>
        SharedFileItemResponseDto.fromDomain(file),
      ),
      nextCursor: page.nextCursor,
    };
  }

  @Get('shared-links/:token/breadcrumb')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Public, unauthenticated: the ancestor chain from the link's own root folder down to the requested folder, inclusive — never reveals anything above the shared root",
  })
  async browseBreadcrumb(
    @Param('token') token: string,
    @Query() query: SharedFolderBreadcrumbQueryDto,
  ): Promise<SharedFolderItemResponseDto[]> {
    const chain = await this.getSharedFolderBreadcrumb.execute(
      token,
      query.password,
      query.folderId,
    );
    return chain.map((folder) =>
      SharedFolderItemResponseDto.fromDomain(folder),
    );
  }

  @Post('shared-links/:token/download')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Public, unauthenticated: get a signed download URL, enforcing the download limit',
  })
  async download(
    @Param('token') token: string,
    @Body() dto: SharedLinkDownloadDto,
  ): Promise<{ url: string; expiresAt: Date; fileName: string }> {
    return this.downloadViaSharedLink.execute(token, dto.password, dto.fileId);
  }

  @Delete('shared-links/:id')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a shared link' })
  async revoke(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.revokeSharedLink.execute(user.id, id);
  }

  @Get('resources/:type/:id/shared-links')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List every active shared link for a file or folder',
  })
  async listForResource(
    @CurrentUser() user: User,
    @Param('type') type: string,
    @Param('id') id: string,
  ): Promise<SharedLinkResponseDto[]> {
    const resourceType = type.toUpperCase() as ResourceTypeName;
    const links = await this.listSharedLinks.execute(user.id, resourceType, id);
    return links.map((link) => SharedLinkResponseDto.fromDomain(link));
  }
}
