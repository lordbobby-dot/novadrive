import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type { AuditEventType, AuditLog } from '../domain/audit-log.entity';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../domain/audit-log.repository';

/** Always scoped to a specific actor — the personal `GET /audit-log` endpoint's own trail.
 * See ListAdminAuditLogUseCase (AdminModule) for the admin-wide, optionally-unscoped query. */
export interface ListAuditLogParams {
  actorId: string;
  eventType?: AuditEventType;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListAuditLogUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLog: AuditLogRepository,
  ) {}

  async execute(params: ListAuditLogParams): Promise<CursorPage<AuditLog>> {
    const rows = await this.auditLog.list(params);
    return buildCursorPage(rows, params.limit);
  }
}
