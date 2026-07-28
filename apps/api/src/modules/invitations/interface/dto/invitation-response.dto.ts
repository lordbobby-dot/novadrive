import { ApiProperty } from '@nestjs/swagger';
import type { Invitation } from '../../domain/invitation.entity';

/** Never includes the token in a listing context — only the direct create response (and the
 * console-logged email) carry it, since it's a bearer credential for accepting the invite. */
export class InvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: ['FILE', 'FOLDER', 'ORGANIZATION'] })
  resourceType!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'GUEST'] })
  role!: string;

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] })
  status!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(invitation: Invitation): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = invitation.id;
    dto.email = invitation.email;
    dto.resourceType = invitation.resourceType;
    dto.resourceId = invitation.resourceId;
    dto.role = invitation.role;
    dto.status = invitation.status;
    dto.expiresAt = invitation.expiresAt;
    dto.createdAt = invitation.createdAt;
    return dto;
  }
}
