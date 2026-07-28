import { ApiProperty } from '@nestjs/swagger';
import type { Folder } from '../../domain/folder.entity';

export class FolderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  parentId!: string | null;

  @ApiProperty()
  depth!: number;

  @ApiProperty({ nullable: true })
  organizationId!: string | null;

  @ApiProperty({ nullable: true })
  workspaceId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(folder: Folder): FolderResponseDto {
    const dto = new FolderResponseDto();
    dto.id = folder.id;
    dto.name = folder.name;
    dto.parentId = folder.parentId;
    dto.depth = folder.depth;
    dto.organizationId = folder.organizationId;
    dto.workspaceId = folder.workspaceId;
    dto.createdAt = folder.createdAt;
    dto.updatedAt = folder.updatedAt;
    return dto;
  }
}
