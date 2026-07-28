import { ApiProperty } from '@nestjs/swagger';
import type { FileVersion } from '../../domain/file-version.entity';

export class FileVersionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileId!: string;

  @ApiProperty()
  versionNumber!: number;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty({ nullable: true })
  changeNote!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  contentType!: string;

  @ApiProperty({
    description:
      'File size in bytes, as a string (safe for values beyond Number.MAX_SAFE_INTEGER)',
  })
  size!: string;

  @ApiProperty({
    description:
      "Whether this version's StorageObject is the file's current one — not necessarily the highest versionNumber, since restoring an earlier version moves the pointer backward without renumbering anything",
  })
  isCurrent!: boolean;

  static fromDomain(
    version: FileVersion,
    currentStorageObjectId: string,
  ): FileVersionResponseDto {
    const dto = new FileVersionResponseDto();
    dto.id = version.id;
    dto.fileId = version.fileId;
    dto.versionNumber = version.versionNumber;
    dto.createdBy = version.createdBy;
    dto.changeNote = version.changeNote;
    dto.createdAt = version.createdAt;
    dto.contentType = version.contentType;
    dto.size = version.size;
    dto.isCurrent = version.storageObjectId === currentStorageObjectId;
    return dto;
  }
}
