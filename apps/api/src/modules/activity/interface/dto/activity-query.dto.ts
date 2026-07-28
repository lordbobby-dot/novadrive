import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../../common/pagination/cursor-pagination.dto';

const ACTIVITY_ACTIONS = [
  'UPLOAD',
  'DOWNLOAD',
  'DELETE',
  'RESTORE',
  'RENAME',
  'MOVE',
  'COPY',
  'SHARE',
  'LOGIN',
  'LOGOUT',
  'PERMISSION_CHANGE',
  'VERSION_RESTORE',
] as const;

export class ActivityQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Restrict to activity on this file/folder id',
  })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ enum: ['FILE', 'FOLDER', 'ACCOUNT'] })
  @IsOptional()
  @IsIn(['FILE', 'FOLDER', 'ACCOUNT'])
  targetType?: 'FILE' | 'FOLDER' | 'ACCOUNT';

  @ApiPropertyOptional({ enum: ACTIVITY_ACTIONS })
  @IsOptional()
  @IsIn(ACTIVITY_ACTIONS)
  action?: (typeof ACTIVITY_ACTIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
