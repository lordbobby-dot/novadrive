import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CorrelationId } from '../../../common/decorators/correlation-id.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { AbortUploadUseCase } from '../application/abort-upload.use-case';
import { CompleteUploadUseCase } from '../application/complete-upload.use-case';
import { GetUploadStatusUseCase } from '../application/get-upload-status.use-case';
import { InitiateUploadUseCase } from '../application/initiate-upload.use-case';
import { PresignUploadPartsUseCase } from '../application/presign-upload-parts.use-case';
import { ReportUploadPartUseCase } from '../application/report-upload-part.use-case';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { InitiateUploadResponseDto } from './dto/initiate-upload-response.dto';
import { PresignPartsDto } from './dto/presign-parts.dto';
import { PresignedPartDto } from './dto/presigned-part.dto';
import { ReportPartDto } from './dto/report-part.dto';
import { UploadStatusResponseDto } from './dto/upload-status-response.dto';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly initiateUpload: InitiateUploadUseCase,
    private readonly presignParts: PresignUploadPartsUseCase,
    private readonly reportPart: ReportUploadPartUseCase,
    private readonly getStatus: GetUploadStatusUseCase,
    private readonly completeUpload: CompleteUploadUseCase,
    private readonly abortUpload: AbortUploadUseCase,
  ) {}

  @Post('initiate')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'EDITOR',
    source: 'body',
    field: 'folderId',
  })
  @ApiOperation({
    summary:
      'Start a multipart upload and get the first batch of presigned part URLs',
  })
  async initiate(
    @CurrentUser() user: User,
    @Body() dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponseDto> {
    return this.initiateUpload.execute({
      ownerId: user.id,
      folderId: dto.folderId,
      name: dto.name,
      contentType: dto.contentType,
      size: dto.size,
      clientChecksum: dto.checksum,
    });
  }

  @Post(':id/presign-parts')
  @ApiOperation({
    summary:
      'Get presigned URLs for more parts (pagination or URL re-signing on retry)',
  })
  async presign(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: PresignPartsDto,
  ): Promise<PresignedPartDto[]> {
    return this.presignParts.execute({
      uploadId: id,
      ownerId: user.id,
      partNumbers: dto.partNumbers,
    });
  }

  @Post(':id/parts')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Report that a part finished uploading to S3 (for resumability)',
  })
  async part(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReportPartDto,
  ): Promise<void> {
    await this.reportPart.execute({
      uploadId: id,
      ownerId: user.id,
      partNumber: dto.partNumber,
      eTag: dto.eTag,
      size: dto.size,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get upload status and already-completed parts (for resuming)',
  })
  async status(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<UploadStatusResponseDto> {
    const { session, parts } = await this.getStatus.execute(id, user.id);
    return {
      uploadId: session.id,
      status: session.status,
      totalParts: session.totalParts,
      completedParts: parts,
    };
  }

  @Post(':id/complete')
  @RequirePermission(
    {
      resourceType: 'FOLDER',
      minimumRole: 'EDITOR',
      source: 'body',
      field: 'folderId',
      optional: true,
    },
    {
      resourceType: 'FILE',
      minimumRole: 'EDITOR',
      source: 'body',
      field: 'versionOfFileId',
      optional: true,
    },
  )
  @ApiOperation({
    summary:
      'Finish the multipart upload; queues checksum verification + File creation',
  })
  async complete(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CompleteUploadDto,
    @CorrelationId() correlationId?: string,
  ): Promise<{ status: string }> {
    return this.completeUpload.execute({
      uploadId: id,
      ownerId: user.id,
      folderId: dto.folderId,
      name: dto.name,
      versionOfFileId: dto.versionOfFileId,
      correlationId,
    });
  }

  @Post(':id/abort')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Cancel an in-progress upload and clean up the S3 multipart upload',
  })
  async abort(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.abortUpload.execute(id, user.id);
  }
}
