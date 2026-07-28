import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../../common/pagination/cursor-pagination.dto';

const AUDIT_EVENT_TYPES = [
  'LOGIN',
  'LOGOUT',
  'SESSION_REVOKED',
  'AUTH_TOKEN_REJECTED',
  'PERMISSION_ESCALATION_ATTEMPT',
  'PERMISSION_GRANTED',
  'PERMISSION_REVOKED',
  'VIRUS_DETECTED',
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'ADMIN_ROLE_GRANTED',
  'ADMIN_ROLE_REVOKED',
] as const;

export class AdminAuditLogQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: "Restrict to one actor's trail — omit to see everyone's",
  })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ enum: AUDIT_EVENT_TYPES })
  @IsOptional()
  @IsIn(AUDIT_EVENT_TYPES)
  eventType?: (typeof AUDIT_EVENT_TYPES)[number];

  @ApiPropertyOptional({
    description: 'e.g. "USER" to see only user-management actions',
  })
  @IsOptional()
  @IsString()
  targetType?: string;
}
