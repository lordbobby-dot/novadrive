import { ApiProperty } from '@nestjs/swagger';
import type { File } from '../../domain/file.entity';

export class FileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  folderId!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty({
    description:
      'File size in bytes, as a string (safe for values beyond Number.MAX_SAFE_INTEGER)',
  })
  size!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(file: File): FileResponseDto {
    const dto = new FileResponseDto();
    dto.id = file.id;
    dto.name = file.name;
    dto.folderId = file.folderId;
    dto.contentType = file.contentType;
    dto.size = file.size;
    dto.createdAt = file.createdAt;
    dto.updatedAt = file.updatedAt;
    return dto;
  }
}
