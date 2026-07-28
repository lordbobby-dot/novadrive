import { ApiProperty } from '@nestjs/swagger';
import type { FavoritedIds } from '../../domain/favorite.repository';

export class FavoritedIdsResponseDto {
  @ApiProperty({ type: [String] })
  fileIds!: string[];

  @ApiProperty({ type: [String] })
  folderIds!: string[];

  static fromDomain(favorited: FavoritedIds): FavoritedIdsResponseDto {
    const dto = new FavoritedIdsResponseDto();
    dto.fileIds = favorited.fileIds;
    dto.folderIds = favorited.folderIds;
    return dto;
  }
}
