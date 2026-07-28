import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../domain/audit-log.repository';

/** The only place that knows the AuditLog table exists — mirrors ActivityListener's role for
 * Activity. Failures are logged and swallowed rather than thrown, same reasoning as
 * ActivityListener: `events.emit()` is fire-and-forget, and a broken audit write must never be
 * allowed to affect the security-relevant action it's recording. */
@Injectable()
export class AuditLogListener {
  private readonly logger = new Logger(AuditLogListener.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLog: AuditLogRepository,
  ) {}

  @OnEvent(AUDIT_EVENT)
  async handleAudit(event: AuditEvent): Promise<void> {
    try {
      await this.auditLog.create({
        actorId: event.actorId,
        eventType: event.eventType,
        outcome: event.outcome,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      });
    } catch (error) {
      this.logger.error(`Failed to record audit log: ${String(error)}`);
    }
  }
}
