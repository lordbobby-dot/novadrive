import { ApiProperty } from '@nestjs/swagger';
import type { SignedUrlResult } from '../../application/get-download-url.use-case';

export class SignedUrlResponseDto {
  @ApiProperty({
    description:
      'Presigned S3 URL — fetch it directly, do not proxy through the API',
  })
  url!: string;

  @ApiProperty({
    description: 'When the URL stops working; request a fresh one after this',
  })
  expiresAt!: Date;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty({
    description:
      'File size in bytes, as a string (safe for values beyond Number.MAX_SAFE_INTEGER)',
  })
  size!: string;

  static fromResult(result: SignedUrlResult): SignedUrlResponseDto {
    const dto = new SignedUrlResponseDto();
    dto.url = result.url;
    dto.expiresAt = result.expiresAt;
    dto.fileName = result.fileName;
    dto.contentType = result.contentType;
    dto.size = result.size;
    return dto;
  }
}
