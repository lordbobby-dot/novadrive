import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({
    description: 'Free-text query, matched against file/folder names',
  })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({ enum: ['file', 'folder'] })
  @IsOptional()
  @IsIn(['file', 'folder'])
  type?: 'file' | 'folder';

  @ApiPropertyOptional({
    description: 'ISO date — only items created on/after this date',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'ISO date — only items created on/before this date',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Tag name — only items tagged with this',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description:
      "Search within this workspace's shared content instead of the caller's personal Drive. Caller must be a VIEWER+ member of the workspace's organization.",
  })
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiPropertyOptional({
    description:
      'User id — only items owned/created by this specific user. Meaningful within workspace search; a no-op in personal search.',
  })
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional({
    description:
      "Folder id — restrict results to this folder's subtree (itself and all descendants).",
  })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({
    description: "Opaque cursor from a previous page's nextCursor",
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
