import { ApiProperty } from '@nestjs/swagger';
import { SharedFileItemResponseDto } from './shared-file-item-response.dto';

export class CursorPageSharedFileDto {
  @ApiProperty({ type: [SharedFileItemResponseDto] })
  items!: SharedFileItemResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
