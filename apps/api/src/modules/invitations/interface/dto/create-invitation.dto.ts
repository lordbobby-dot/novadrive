import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString } from 'class-validator';
import type {
  PermissionRoleName,
  ResourceTypeName,
} from '../../../sharing/domain/permission.entity';

const RESOURCE_TYPES: ResourceTypeName[] = ['FILE', 'FOLDER', 'ORGANIZATION'];
const ROLES: PermissionRoleName[] = [
  'OWNER',
  'ADMIN',
  'EDITOR',
  'VIEWER',
  'GUEST',
];

export class CreateInvitationDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: RESOURCE_TYPES })
  @IsIn(RESOURCE_TYPES)
  resourceType!: ResourceTypeName;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: PermissionRoleName;
}
