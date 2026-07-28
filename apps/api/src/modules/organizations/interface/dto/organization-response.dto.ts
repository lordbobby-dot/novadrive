import { ApiProperty } from '@nestjs/swagger';
import type { Organization } from '../../domain/organization.entity';
import type { PermissionRoleName } from '../../../sharing/domain/permission.entity';

export class OrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ownerId!: string;

  /** The caller's own resolved org role — lets the frontend gate "Delete organization"/"Rename"/
   * "Manage members" without a second round trip. */
  @ApiProperty({
    enum: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'GUEST'],
  })
  myRole!: PermissionRoleName;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    org: Organization,
    myRole: PermissionRoleName,
  ): OrganizationResponseDto {
    const dto = new OrganizationResponseDto();
    dto.id = org.id;
    dto.name = org.name;
    dto.ownerId = org.ownerId;
    dto.myRole = myRole;
    dto.createdAt = org.createdAt;
    dto.updatedAt = org.updatedAt;
    return dto;
  }
}
