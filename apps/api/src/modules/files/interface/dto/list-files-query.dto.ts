import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../../common/pagination/cursor-pagination.dto';

export class ListFilesQueryDto extends CursorPaginationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  folderId!: string;
}
