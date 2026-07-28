import { ApiProperty } from '@nestjs/swagger';
import type { SharedLinkAccessResult } from '../../application/get-shared-link.use-case';

/** The public, unauthenticated view — deliberately excludes the token (the caller already has
 * it, it's in the URL) and everything about the link's owner. */
export class SharedLinkAccessResponseDto {
  @ApiProperty({ enum: ['FILE', 'FOLDER'] })
  resourceType!: string;

  @ApiProperty()
  resourceName!: string;

  @ApiProperty({ nullable: true })
  contentType!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Bytes, as a string; null for folders',
  })
  size!: string | null;

  @ApiProperty()
  canView!: boolean;

  @ApiProperty()
  canDownload!: boolean;

  @ApiProperty()
  canComment!: boolean;

  @ApiProperty()
  canEdit!: boolean;

  static fromResult(
    result: SharedLinkAccessResult,
  ): SharedLinkAccessResponseDto {
    const dto = new SharedLinkAccessResponseDto();
    dto.resourceType = result.link.resourceType;
    dto.resourceName = result.resourceName;
    dto.contentType = result.contentType;
    dto.size = result.size;
    dto.canView = result.link.canView;
    dto.canDownload = result.link.canDownload;
    dto.canComment = result.link.canComment;
    dto.canEdit = result.link.canEdit;
    return dto;
  }
}
