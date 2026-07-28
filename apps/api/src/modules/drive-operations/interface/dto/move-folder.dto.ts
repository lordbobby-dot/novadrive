import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MoveFolderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetParentId!: string;
}
