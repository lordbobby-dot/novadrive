import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from './file-response.dto';

export class CursorPageFileDto {
  @ApiProperty({ type: [FileResponseDto] })
  items!: FileResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
