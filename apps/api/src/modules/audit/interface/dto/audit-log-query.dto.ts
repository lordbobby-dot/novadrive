import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationDto } from '../../../../common/pagination/cursor-pagination.dto';

const AUDIT_EVENT_TYPES = [
  'LOGIN',
  'LOGOUT',
  'SESSION_REVOKED',
  'AUTH_TOKEN_REJECTED',
  'PERMISSION_ESCALATION_ATTEMPT',
  'PERMISSION_GRANTED',
  'PERMISSION_REVOKED',
] as const;

export class AuditLogQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ enum: AUDIT_EVENT_TYPES })
  @IsOptional()
  @IsIn(AUDIT_EVENT_TYPES)
  eventType?: (typeof AUDIT_EVENT_TYPES)[number];
}
