import { ApiProperty } from '@nestjs/swagger';
import type { TrashListItem } from '../../domain/trash.entity';

export class TrashItemResponseDto {
  @ApiProperty({
    description: 'The Trash row id — pass this to DELETE /trash/:id/permanent',
  })
  trashId!: string;

  @ApiProperty({ enum: ['file', 'folder'] })
  type!: 'file' | 'folder';

  @ApiProperty({ description: "The file or folder's own id" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  deletedAt!: Date;

  static fromDomain(item: TrashListItem): TrashItemResponseDto {
    const dto = new TrashItemResponseDto();
    dto.trashId = item.trashId;
    dto.type = item.type;
    dto.id = item.id;
    dto.name = item.name;
    dto.deletedAt = item.deletedAt;
    return dto;
  }
}

export class TrashPageResponseDto {
  @ApiProperty({ type: [TrashItemResponseDto] })
  items!: TrashItemResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
