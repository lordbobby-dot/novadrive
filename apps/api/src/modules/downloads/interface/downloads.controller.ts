import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { GetDownloadUrlUseCase } from '../application/get-download-url.use-case';
import { GetPreviewUrlUseCase } from '../application/get-preview-url.use-case';
import { SignedUrlResponseDto } from './dto/signed-url-response.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class DownloadsController {
  constructor(
    private readonly getDownloadUrl: GetDownloadUrlUseCase,
    private readonly getPreviewUrl: GetPreviewUrlUseCase,
  ) {}

  @Get(':id/download-url')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({
    summary: 'Get a short-lived signed S3 URL that forces a download',
  })
  async downloadUrl(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<SignedUrlResponseDto> {
    const result = await this.getDownloadUrl.execute(id, user.id);
    return SignedUrlResponseDto.fromResult(result);
  }

  @Get(':id/preview-url')
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'VIEWER',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({
    summary:
      'Get a short-lived signed S3 URL suitable for inline rendering (img/video/iframe/fetch)',
  })
  async previewUrl(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<SignedUrlResponseDto> {
    const result = await this.getPreviewUrl.execute(id, user.id);
    return SignedUrlResponseDto.fromResult(result);
  }
}
