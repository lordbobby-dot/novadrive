import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type {
  PermissionRoleName,
  ResourceTypeName,
} from '../../domain/permission.entity';

const RESOURCE_TYPES: ResourceTypeName[] = ['FILE', 'FOLDER'];
const ROLES: PermissionRoleName[] = [
  'OWNER',
  'ADMIN',
  'EDITOR',
  'VIEWER',
  'GUEST',
];

export class GrantPermissionDto {
  @ApiProperty({ description: 'The id of the user to grant access to' })
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

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
