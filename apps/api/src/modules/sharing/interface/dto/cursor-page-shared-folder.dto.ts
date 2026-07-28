import { ApiProperty } from '@nestjs/swagger';
import { SharedFolderItemResponseDto } from './shared-folder-item-response.dto';

export class CursorPageSharedFolderDto {
  @ApiProperty({ type: [SharedFolderItemResponseDto] })
  items!: SharedFolderItemResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
