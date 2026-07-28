import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { PermissionRoleName } from '../../../sharing/domain/permission.entity';

const ROLES: PermissionRoleName[] = [
  'OWNER',
  'ADMIN',
  'EDITOR',
  'VIEWER',
  'GUEST',
];

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: PermissionRoleName;
}
