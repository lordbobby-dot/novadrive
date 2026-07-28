import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CopyFolderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetParentId!: string;

  @ApiPropertyOptional({ description: 'Defaults to the source folder name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;
}
