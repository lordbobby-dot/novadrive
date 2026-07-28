import { ApiProperty } from '@nestjs/swagger';
import type { Tag } from '../../domain/tag.entity';

export class TagResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(tag: Tag): TagResponseDto {
    const dto = new TagResponseDto();
    dto.id = tag.id;
    dto.name = tag.name;
    dto.createdAt = tag.createdAt;
    return dto;
  }
}
