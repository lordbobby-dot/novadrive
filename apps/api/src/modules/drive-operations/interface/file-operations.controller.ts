import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { FileResponseDto } from '../../files/interface/dto/file-response.dto';
import { CopyFileUseCase } from '../application/copy-file.use-case';
import { DeleteFileUseCase } from '../application/delete-file.use-case';
import { MoveFileUseCase } from '../application/move-file.use-case';
import { CopyFileDto } from './dto/copy-file.dto';
import { MoveFileDto } from './dto/move-file.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FileOperationsController {
  constructor(
    private readonly moveFile: MoveFileUseCase,
    private readonly copyFile: CopyFileUseCase,
    private readonly deleteFile: DeleteFileUseCase,
  ) {}

  @Patch(':id/move')
  @RequirePermission(
    {
      resourceType: 'FILE',
      minimumRole: 'EDITOR',
      source: 'params',
      field: 'id',
    },
    {
      resourceType: 'FOLDER',
      minimumRole: 'EDITOR',
      source: 'body',
      field: 'targetFolderId',
    },
  )
  @ApiOperation({ summary: 'Move a file into a different folder' })
  async move(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: MoveFileDto,
  ): Promise<FileResponseDto> {
    const file = await this.moveFile.execute({
      id,
      actorId: user.id,
      targetFolderId: dto.targetFolderId,
    });
    return FileResponseDto.fromDomain(file);
  }

  @Post(':id/copy')
  @RequirePermission(
    {
      resourceType: 'FILE',
      minimumRole: 'VIEWER',
      source: 'params',
      field: 'id',
    },
    {
      resourceType: 'FOLDER',
      minimumRole: 'EDITOR',
      source: 'body',
      field: 'targetFolderId',
    },
  )
  @ApiOperation({
    summary:
      'Copy a file — a real S3 server-side copy, independent StorageObject',
  })
  async copy(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CopyFileDto,
  ): Promise<FileResponseDto> {
    const file = await this.copyFile.execute({
      id,
      ownerId: user.id,
      targetFolderId: dto.targetFolderId,
      name: dto.name,
    });
    return FileResponseDto.fromDomain(file);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission({
    resourceType: 'FILE',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({ summary: 'Soft-delete a file' })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteFile.execute(id, user.id);
  }
}
