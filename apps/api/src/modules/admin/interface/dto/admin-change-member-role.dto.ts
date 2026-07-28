import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { PermissionRoleName } from '../../../sharing/domain/permission.entity';

// OWNER excluded — ownership moves only through TransferOrganizationOwnershipUseCase, never a
// plain role change (see AdminChangeMemberRoleUseCase).
const ADMIN_ASSIGNABLE_ROLES: PermissionRoleName[] = [
  'ADMIN',
  'EDITOR',
  'VIEWER',
  'GUEST',
];

export class AdminChangeMemberRoleDto {
  @ApiProperty({ enum: ADMIN_ASSIGNABLE_ROLES })
  @IsIn(ADMIN_ASSIGNABLE_ROLES)
  role!: PermissionRoleName;
}
