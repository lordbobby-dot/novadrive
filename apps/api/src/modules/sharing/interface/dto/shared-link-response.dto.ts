import { ApiProperty } from '@nestjs/swagger';
import type { SharedLink } from '../../domain/shared-link.entity';

/** The owner-facing view — includes the token (needed to build the shareable URL) but never the
 * password hash. */
export class SharedLinkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['FILE', 'FOLDER'] })
  resourceType!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty()
  token!: string;

  @ApiProperty()
  hasPassword!: boolean;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  @ApiProperty({ nullable: true })
  maxDownloads!: number | null;

  @ApiProperty()
  downloadCount!: number;

  @ApiProperty()
  canView!: boolean;

  @ApiProperty()
  canDownload!: boolean;

  @ApiProperty()
  canComment!: boolean;

  @ApiProperty()
  canEdit!: boolean;

  @ApiProperty({ enum: ['PRIVATE', 'ORG', 'PUBLIC'] })
  visibility!: string;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(link: SharedLink): SharedLinkResponseDto {
    const dto = new SharedLinkResponseDto();
    dto.id = link.id;
    dto.resourceType = link.resourceType;
    dto.resourceId = link.resourceId;
    dto.token = link.token;
    dto.hasPassword = link.passwordHash !== null;
    dto.expiresAt = link.expiresAt;
    dto.maxDownloads = link.maxDownloads;
    dto.downloadCount = link.downloadCount;
    dto.canView = link.canView;
    dto.canDownload = link.canDownload;
    dto.canComment = link.canComment;
    dto.canEdit = link.canEdit;
    dto.visibility = link.visibility;
    dto.createdAt = link.createdAt;
    return dto;
  }
}
