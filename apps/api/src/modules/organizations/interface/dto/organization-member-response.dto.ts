import { ApiProperty } from '@nestjs/swagger';
import type { OrganizationMemberWithUser } from '../../application/list-organization-members.use-case';

export class OrganizationMemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'GUEST'] })
  role!: string;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(
    entry: OrganizationMemberWithUser,
  ): OrganizationMemberResponseDto {
    const dto = new OrganizationMemberResponseDto();
    dto.id = entry.member.id;
    dto.organizationId = entry.member.organizationId;
    dto.userId = entry.member.userId;
    dto.email = entry.email;
    dto.name = entry.name;
    dto.role = entry.member.role;
    dto.createdAt = entry.member.createdAt;
    return dto;
  }
}
