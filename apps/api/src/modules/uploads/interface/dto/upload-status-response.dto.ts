import { ApiProperty } from '@nestjs/swagger';

class UploadedPartDto {
  @ApiProperty()
  partNumber!: number;

  @ApiProperty()
  eTag!: string;

  @ApiProperty()
  size!: string;
}

export class UploadStatusResponseDto {
  @ApiProperty()
  uploadId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  totalParts!: number | null;

  @ApiProperty({ type: [UploadedPartDto] })
  completedParts!: UploadedPartDto[];
}
