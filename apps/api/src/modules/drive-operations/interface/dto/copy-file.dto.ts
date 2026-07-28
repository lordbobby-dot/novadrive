import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CopyFileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetFolderId!: string;

  @ApiPropertyOptional({ description: 'Defaults to the source file name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;
}
