import { ApiProperty } from '@nestjs/swagger';
import type { Folder } from '../../../folders/domain/folder.entity';

/** Deliberately slimmer than the self-service FolderResponseDto — no ownerId/organizationId/
 * workspaceId/timestamps, matching SharedLinkAccessResponseDto's "reveal nothing about the
 * owner" principle for this same public, unauthenticated surface. */
export class SharedFolderItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  static fromDomain(folder: Folder): SharedFolderItemResponseDto {
    const dto = new SharedFolderItemResponseDto();
    dto.id = folder.id;
    dto.name = folder.name;
    return dto;
  }
}
