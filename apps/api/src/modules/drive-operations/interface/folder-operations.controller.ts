import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../sharing/interface/require-permission.decorator';
import type { User } from '../../users/domain/user.entity';
import { FolderResponseDto } from '../../folders/interface/dto/folder-response.dto';
import { CopyFolderUseCase } from '../application/copy-folder.use-case';
import { DeleteFolderUseCase } from '../application/delete-folder.use-case';
import { MoveFolderUseCase } from '../application/move-folder.use-case';
import { CopyFolderDto } from './dto/copy-folder.dto';
import { DeleteFolderResponseDto } from './dto/delete-folder-response.dto';
import { MoveFolderDto } from './dto/move-folder.dto';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
export class FolderOperationsController {
  constructor(
    private readonly moveFolder: MoveFolderUseCase,
    private readonly copyFolder: CopyFolderUseCase,
    private readonly deleteFolder: DeleteFolderUseCase,
  ) {}

  @Patch(':id/move')
  @RequirePermission(
    {
      resourceType: 'FOLDER',
      minimumRole: 'EDITOR',
      source: 'params',
      field: 'id',
    },
    {
      resourceType: 'FOLDER',
      minimumRole: 'EDITOR',
      source: 'body',
      field: 'targetParentId',
    },
  )
  @ApiOperation({ summary: 'Move a folder under a new parent' })
  async move(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.moveFolder.execute({
      id,
      actorId: user.id,
      targetParentId: dto.targetParentId,
    });
    return FolderResponseDto.fromDomain(folder);
  }

  @Post(':id/copy')
  @RequirePermission(
    {
      resourceType: 'FOLDER',
      minimumRole: 'VIEWER',
      source: 'params',
      field: 'id',
    },
    {
      resourceType: 'FOLDER',
      minimumRole: 'EDITOR',
      source: 'body',
      field: 'targetParentId',
    },
  )
  @ApiOperation({
    summary:
      'Deep-copy a folder (and everything inside it) into another folder',
  })
  async copy(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CopyFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.copyFolder.execute({
      id,
      ownerId: user.id,
      targetParentId: dto.targetParentId,
      name: dto.name,
    });
    return FolderResponseDto.fromDomain(folder);
  }

  @Delete(':id')
  @RequirePermission({
    resourceType: 'FOLDER',
    minimumRole: 'EDITOR',
    source: 'params',
    field: 'id',
  })
  @ApiOperation({
    summary: 'Recursively soft-delete a folder and everything inside it',
  })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DeleteFolderResponseDto> {
    const result = await this.deleteFolder.execute(id, user.id);
    return DeleteFolderResponseDto.fromResult(result);
  }
}
