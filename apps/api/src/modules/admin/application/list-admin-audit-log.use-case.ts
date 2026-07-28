import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type {
  AuditEventType,
  AuditLog,
} from '../../audit/domain/audit-log.entity';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../../audit/domain/audit-log.repository';

export interface ListAdminAuditLogParams {
  /** Omit to see every actor's activity — set to inspect one specific user's trail. */
  actorId?: string;
  eventType?: AuditEventType;
  targetType?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListAdminAuditLogUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLog: AuditLogRepository,
  ) {}

  async execute(
    params: ListAdminAuditLogParams,
  ): Promise<CursorPage<AuditLog>> {
    const rows = await this.auditLog.list(params);
    return buildCursorPage(rows, params.limit);
  }
}
