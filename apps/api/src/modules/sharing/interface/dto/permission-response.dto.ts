import { ApiProperty } from '@nestjs/swagger';
import type { Permission } from '../../domain/permission.entity';
import type { PermissionWithSubject } from '../../application/list-permissions-for-resource.use-case';

export class PermissionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty({ nullable: true })
  subjectEmail!: string | null;

  @ApiProperty({ nullable: true })
  subjectName!: string | null;

  @ApiProperty({ enum: ['FILE', 'FOLDER'] })
  resourceType!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'GUEST'] })
  role!: string;

  @ApiProperty()
  grantedBy!: string;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(permission: Permission): PermissionResponseDto {
    const dto = new PermissionResponseDto();
    dto.id = permission.id;
    dto.subjectId = permission.subjectId;
    dto.subjectEmail = null;
    dto.subjectName = null;
    dto.resourceType = permission.resourceType;
    dto.resourceId = permission.resourceId;
    dto.role = permission.role;
    dto.grantedBy = permission.grantedBy;
    dto.createdAt = permission.createdAt;
    return dto;
  }

  static fromDomainWithSubject(
    entry: PermissionWithSubject,
  ): PermissionResponseDto {
    const dto = PermissionResponseDto.fromDomain(entry.permission);
    dto.subjectEmail = entry.subjectEmail;
    dto.subjectName = entry.subjectName;
    return dto;
  }
}
