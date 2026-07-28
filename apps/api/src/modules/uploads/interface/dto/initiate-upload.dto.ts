import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class InitiateUploadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  folderId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({ description: 'File size in bytes, as a string' })
  @IsNumberString()
  size!: string;

  @ApiPropertyOptional({
    description: 'Client-computed SHA-256 hex digest of the file',
  })
  @IsOptional()
  @IsString()
  checksum?: string;
}
