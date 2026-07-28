import { ApiProperty } from '@nestjs/swagger';
import type { AuditLog } from '../../domain/audit-log.entity';

export class AuditLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  actorId!: string | null;

  @ApiProperty()
  eventType!: string;

  @ApiProperty()
  outcome!: string;

  @ApiProperty({ nullable: true })
  targetType!: string | null;

  @ApiProperty({ nullable: true })
  targetId!: string | null;

  @ApiProperty({ nullable: true, additionalProperties: true, type: 'object' })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true })
  userAgent!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(auditLog: AuditLog): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();
    dto.id = auditLog.id;
    dto.actorId = auditLog.actorId;
    dto.eventType = auditLog.eventType;
    dto.outcome = auditLog.outcome;
    dto.targetType = auditLog.targetType;
    dto.targetId = auditLog.targetId;
    dto.metadata = auditLog.metadata;
    dto.ipAddress = auditLog.ipAddress;
    dto.userAgent = auditLog.userAgent;
    dto.createdAt = auditLog.createdAt;
    return dto;
  }
}

export class AuditLogPageResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  items!: AuditLogResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
