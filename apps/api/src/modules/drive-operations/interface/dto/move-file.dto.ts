import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MoveFileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetFolderId!: string;
}
