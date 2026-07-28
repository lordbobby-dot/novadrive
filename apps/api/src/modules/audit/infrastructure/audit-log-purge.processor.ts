import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { trace } from '@opentelemetry/api';
import { PinoLogger } from 'nestjs-pino';
import { PurgeAuditLogsUseCase } from '../application/purge-audit-logs.use-case';
import { AUDIT_LOG_PURGE_QUEUE } from './audit-log-purge.queue';

const tracer = trace.getTracer('novadrive-bullmq');

/** Cron-triggered, not spawned by any HTTP request — so there's no originating correlation id to
 * inherit. Each run still gets its own synthetic one, same shape as TrashCleanupProcessor. */
@Processor(AUDIT_LOG_PURGE_QUEUE)
export class AuditLogPurgeProcessor extends WorkerHost {
  constructor(
    private readonly purgeAuditLogs: PurgeAuditLogsUseCase,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(AuditLogPurgeProcessor.name);
  }

  async process(): Promise<void> {
    const correlationId = randomUUID();
    await tracer.startActiveSpan(
      'audit-log-purge.process',
      { attributes: { correlationId } },
      async (span) => {
        try {
          const { deleted } = await this.purgeAuditLogs.execute();
          this.logger.info(
            { correlationId, deleted },
            `AuditLog purge: deleted ${deleted}`,
          );
        } finally {
          span.end();
        }
      },
    );
  }
}
