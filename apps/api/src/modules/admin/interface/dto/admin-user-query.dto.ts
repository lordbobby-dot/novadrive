import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../../common/pagination/cursor-pagination.dto';

export class AdminUserQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive partial match against email or name',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
