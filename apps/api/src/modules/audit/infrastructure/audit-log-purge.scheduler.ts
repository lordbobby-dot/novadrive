import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  AUDIT_LOG_PURGE_JOB_NAME,
  AUDIT_LOG_PURGE_JOB_SCHEDULER_ID,
  AUDIT_LOG_PURGE_QUEUE,
} from './audit-log-purge.queue';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Registers the repeatable purge job on boot. `upsertJobScheduler` is idempotent by
 * `jobSchedulerId` — restarting the API doesn't pile up duplicate repeatable jobs the way calling
 * `queue.add(..., { repeat })` on every boot would. Same daily cadence as TrashCleanupScheduler —
 * a retention purge has no reason to run more often than that. */
@Injectable()
export class AuditLogPurgeScheduler implements OnModuleInit {
  private readonly logger = new Logger(AuditLogPurgeScheduler.name);

  constructor(
    @InjectQueue(AUDIT_LOG_PURGE_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      AUDIT_LOG_PURGE_JOB_SCHEDULER_ID,
      { every: ONE_DAY_MS },
      { name: AUDIT_LOG_PURGE_JOB_NAME },
    );
    this.logger.log('AuditLog purge job scheduled to run every 24h');
  }
}
