import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

function splitCommaSeparated({ value }: { value: unknown }): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').filter(Boolean);
}

export class CheckFavoritedQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Comma-separated file ids to check, e.g. "id1,id2,id3"',
  })
  @IsOptional()
  @Transform(splitCommaSeparated)
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  fileIds?: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'Comma-separated folder ids to check, e.g. "id1,id2,id3"',
  })
  @IsOptional()
  @Transform(splitCommaSeparated)
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  folderIds?: string[];
}
