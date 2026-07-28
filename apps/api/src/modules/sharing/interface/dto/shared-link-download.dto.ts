import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SharedLinkDownloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description:
      'Required when the link points at a FOLDER — the specific file (discovered via .../folders and .../files) to download. Ignored for a FILE-type link.',
  })
  @IsOptional()
  @IsString()
  fileId?: string;
}
