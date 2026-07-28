import { ApiProperty } from '@nestjs/swagger';
import type { SharedWithMeItem } from '../../domain/shared-with-me.entity';

export class SharedWithMeItemDto {
  @ApiProperty({ enum: ['file', 'folder'] })
  type!: 'file' | 'folder';

  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  parentOrFolderId!: string | null;

  @ApiProperty({ nullable: true })
  contentType!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'File size in bytes as a string; null for folders',
  })
  size!: string | null;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'GUEST'] })
  role!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ nullable: true })
  ownerName!: string | null;

  @ApiProperty()
  grantedAt!: Date;

  static fromDomain(item: SharedWithMeItem): SharedWithMeItemDto {
    const dto = new SharedWithMeItemDto();
    dto.type = item.type;
    dto.id = item.id;
    dto.name = item.name;
    dto.parentOrFolderId = item.parentOrFolderId;
    dto.contentType = item.contentType;
    dto.size = item.size;
    dto.role = item.role;
    dto.ownerId = item.ownerId;
    dto.ownerName = item.ownerName;
    dto.grantedAt = item.grantedAt;
    return dto;
  }
}

export class SharedWithMePageDto {
  @ApiProperty({ type: [SharedWithMeItemDto] })
  items!: SharedWithMeItemDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
