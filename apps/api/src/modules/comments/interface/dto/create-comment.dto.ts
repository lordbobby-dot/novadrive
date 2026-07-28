import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ResourceTypeName } from '../../../sharing/domain/permission.entity';

const RESOURCE_TYPES: ResourceTypeName[] = ['FILE', 'FOLDER'];

export class CreateCommentDto {
  @ApiProperty({ enum: RESOURCE_TYPES })
  @IsIn(RESOURCE_TYPES)
  resourceType!: ResourceTypeName;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}
