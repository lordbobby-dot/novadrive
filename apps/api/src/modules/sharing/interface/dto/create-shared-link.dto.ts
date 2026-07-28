import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { ResourceTypeName } from '../../domain/permission.entity';
import type { LinkVisibilityName } from '../../domain/shared-link.entity';

const RESOURCE_TYPES: ResourceTypeName[] = ['FILE', 'FOLDER'];
const VISIBILITIES: LinkVisibilityName[] = ['PRIVATE', 'ORG', 'PUBLIC'];

export class CreateSharedLinkDto {
  @ApiProperty({ enum: RESOURCE_TYPES })
  @IsIn(RESOURCE_TYPES)
  resourceType!: ResourceTypeName;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiPropertyOptional({
    description: 'If set, viewers must enter this password',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDownloads?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canView?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canComment?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @ApiPropertyOptional({ enum: VISIBILITIES, default: 'PRIVATE' })
  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: LinkVisibilityName;
}
