import { ApiProperty } from '@nestjs/swagger';
import { FolderResponseDto } from './folder-response.dto';

export class CursorPageFolderDto {
  @ApiProperty({ type: [FolderResponseDto] })
  items!: FolderResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
