import { ApiProperty } from '@nestjs/swagger';
import type { File } from '../../../files/domain/file.entity';

/** Deliberately slimmer than the self-service FileResponseDto — no folderId/timestamps, same
 * "reveal nothing about the owner" principle SharedLinkAccessResponseDto already established.
 * contentType/size are kept since the single-file access endpoint already exposes them. */
export class SharedFileItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty({
    description:
      'File size in bytes, as a string (safe for values beyond Number.MAX_SAFE_INTEGER)',
  })
  size!: string;

  static fromDomain(file: File): SharedFileItemResponseDto {
    const dto = new SharedFileItemResponseDto();
    dto.id = file.id;
    dto.name = file.name;
    dto.contentType = file.contentType;
    dto.size = file.size;
    return dto;
  }
}
