import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { FileResponseDto } from '../../files/interface/dto/file-response.dto';
import { SignedUrlResponseDto } from '../../downloads/interface/dto/signed-url-response.dto';
import { ListFileVersionsUseCase } from '../application/list-file-versions.use-case';
import { RestoreFileVersionUseCase } from '../application/restore-file-version.use-case';
import { GetFileVersionDownloadUrlUseCase } from '../application/get-file-version-download-url.use-case';
import { FileVersionResponseDto } from './dto/file-version-response.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FileVersionsController {
  constructor(
    private readonly listVersions: ListFileVersionsUseCase,
    private readonly restoreVersion: RestoreFileVersionUseCase,
    private readonly getVersionDownloadUrl: GetFileVersionDownloadUrlUseCase,
  ) {}

  @Get(':id/versions')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'List every version of a file, newest first' })
  async list(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FileVersionResponseDto[]> {
    const { versions, currentStorageObjectId } =
      await this.listVersions.execute(id, user.id);
    return versions.map((version) =>
      FileVersionResponseDto.fromDomain(version, currentStorageObjectId),
    );
  }

  @Post(':id/versions/:v/restore')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({
    summary:
      'Make an earlier version current, without deleting the version it replaces',
  })
  async restore(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('v', ParseIntPipe) versionNumber: number,
  ): Promise<FileResponseDto> {
    const file = await this.restoreVersion.execute(id, user.id, versionNumber);
    return FileResponseDto.fromDomain(file);
  }

  @Get(':id/versions/:v/download-url')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({
    summary: 'Get a short-lived signed S3 URL for a specific past version',
  })
  async downloadUrl(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('v', ParseIntPipe) versionNumber: number,
  ): Promise<SignedUrlResponseDto> {
    const result = await this.getVersionDownloadUrl.execute(
      id,
      user.id,
      versionNumber,
    );
    return SignedUrlResponseDto.fromResult(result);
  }
}
