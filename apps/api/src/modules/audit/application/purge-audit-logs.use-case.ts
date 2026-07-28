import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../domain/audit-log.repository';
import { computeAuditLogRetentionCutoff } from '../domain/retention';

/** Run by the repeatable BullMQ job (see infrastructure/audit-log-purge.processor.ts). Deletes
 * every AuditLog row older than AUDIT_LOG_RETENTION_DAYS in one batched delete — unlike
 * PurgeExpiredTrashUseCase there's no per-item S3/permission work to fail partway through, so a
 * single deleteMany is sufficient rather than a per-row loop with its own try/catch. */
@Injectable()
export class PurgeAuditLogsUseCase {
  private readonly logger = new Logger(PurgeAuditLogsUseCase.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLog: AuditLogRepository,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async execute(): Promise<{ deleted: number }> {
    const retentionDays = this.config.get('AUDIT_LOG_RETENTION_DAYS', {
      infer: true,
    });
    const cutoff = computeAuditLogRetentionCutoff(new Date(), retentionDays);
    const deleted = await this.auditLog.deleteOlderThan(cutoff);
    return { deleted };
  }
}
