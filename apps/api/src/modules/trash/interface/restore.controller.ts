import { Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { FileResponseDto } from '../../files/interface/dto/file-response.dto';
import { FolderResponseDto } from '../../folders/interface/dto/folder-response.dto';
import { RestoreFileUseCase } from '../application/restore-file.use-case';
import { RestoreFolderUseCase } from '../application/restore-folder.use-case';

/** Restore routes hang off `/files` and `/folders` (matching where every other file/folder
 * action lives) rather than `/trash`, since they're addressed by the file/folder's own id, not
 * the Trash row id — only permanent-delete needs the Trash row id, to resolve type ambiguity. */
@ApiTags('files', 'folders')
@ApiBearerAuth()
@Controller()
export class RestoreController {
  constructor(
    private readonly restoreFile: RestoreFileUseCase,
    private readonly restoreFolder: RestoreFolderUseCase,
  ) {}

  @Post('files/:id/restore')
  @ApiOperation({
    summary:
      'Restore a trashed file to its original folder, or the root if that folder was also deleted',
  })
  async restoreFileRoute(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FileResponseDto> {
    const file = await this.restoreFile.execute(id, user.id);
    return FileResponseDto.fromDomain(file);
  }

  @Post('folders/:id/restore')
  @ApiOperation({
    summary:
      'Restore a trashed folder and its entire subtree, relocating to root if the original parent was also deleted',
  })
  async restoreFolderRoute(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.restoreFolder.execute(id, user.id);
    return FolderResponseDto.fromDomain(folder);
  }
}
