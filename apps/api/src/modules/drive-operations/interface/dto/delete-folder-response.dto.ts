import { ApiProperty } from '@nestjs/swagger';
import type { DeleteFolderResult } from '../../application/delete-folder.use-case';

export class DeleteFolderResponseDto {
  @ApiProperty({
    description: 'The folder itself plus every descendant folder trashed',
  })
  trashedFolders!: number;

  @ApiProperty({ description: 'Every file across the whole trashed subtree' })
  trashedFiles!: number;

  static fromResult(result: DeleteFolderResult): DeleteFolderResponseDto {
    const dto = new DeleteFolderResponseDto();
    dto.trashedFolders = result.trashedFolders;
    dto.trashedFiles = result.trashedFiles;
    return dto;
  }
}
