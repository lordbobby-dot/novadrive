import { ApiProperty } from '@nestjs/swagger';
import type { Workspace } from '../../domain/workspace.entity';

export class WorkspaceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(workspace: Workspace): WorkspaceResponseDto {
    const dto = new WorkspaceResponseDto();
    dto.id = workspace.id;
    dto.organizationId = workspace.organizationId;
    dto.name = workspace.name;
    dto.createdAt = workspace.createdAt;
    dto.updatedAt = workspace.updatedAt;
    return dto;
  }
}
