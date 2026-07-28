import { ApiProperty } from '@nestjs/swagger';
import type { AdminOrganizationSummary } from '../../application/list-admin-organizations.use-case';

export class AdminOrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty()
  workspaceCount!: number;

  @ApiProperty({ description: 'BigInt serialized as a string' })
  storageUsedBytes!: string;

  @ApiProperty({
    nullable: true,
    description: 'null if the org has never attempted an upload',
  })
  storageLimitBytes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(
    org: AdminOrganizationSummary,
  ): AdminOrganizationResponseDto {
    const dto = new AdminOrganizationResponseDto();
    dto.id = org.id;
    dto.name = org.name;
    dto.ownerId = org.ownerId;
    dto.memberCount = org.memberCount;
    dto.workspaceCount = org.workspaceCount;
    dto.storageUsedBytes = org.storageUsedBytes;
    dto.storageLimitBytes = org.storageLimitBytes;
    dto.createdAt = org.createdAt;
    return dto;
  }
}

export class AdminOrganizationPageResponseDto {
  @ApiProperty({ type: [AdminOrganizationResponseDto] })
  items!: AdminOrganizationResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
