import { ApiProperty } from '@nestjs/swagger';
import { PresignedPartDto } from './presigned-part.dto';

export class InitiateUploadResponseDto {
  @ApiProperty()
  uploadId!: string;

  @ApiProperty()
  bucket!: string;

  @ApiProperty()
  objectKey!: string;

  @ApiProperty()
  partSize!: string;

  @ApiProperty()
  totalParts!: number;

  @ApiProperty({ type: [PresignedPartDto] })
  parts!: PresignedPartDto[];
}
