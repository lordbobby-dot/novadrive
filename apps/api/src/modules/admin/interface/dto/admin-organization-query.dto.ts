import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../../common/pagination/cursor-pagination.dto';

export class AdminOrganizationQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive partial match against org name',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
