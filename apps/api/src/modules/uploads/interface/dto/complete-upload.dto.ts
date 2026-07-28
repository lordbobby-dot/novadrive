import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Either `versionOfFileId` is set (this upload becomes a new version of an existing file), or
 * both `folderId` and `name` are set (this upload becomes a brand-new file) — the use case
 * validates that exactly one of those shapes was sent, since class-validator's declarative
 * decorators can't express "these three fields are mutually exclusive groups" cleanly. */
export class CompleteUploadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  folderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Set to make this upload a new version of an existing file instead of a new file',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  versionOfFileId?: string;
}
