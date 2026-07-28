import { ApiProperty } from '@nestjs/swagger';
import type { SearchResultItem } from '../../domain/search-result.entity';

export class SearchResultItemDto {
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

  @ApiProperty()
  rank!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(item: SearchResultItem): SearchResultItemDto {
    const dto = new SearchResultItemDto();
    dto.type = item.type;
    dto.id = item.id;
    dto.name = item.name;
    dto.parentOrFolderId = item.parentOrFolderId;
    dto.contentType = item.contentType;
    dto.size = item.size;
    dto.rank = item.rank;
    dto.createdAt = item.createdAt;
    dto.updatedAt = item.updatedAt;
    return dto;
  }
}

export class SearchResultPageDto {
  @ApiProperty({ type: [SearchResultItemDto] })
  items!: SearchResultItemDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
