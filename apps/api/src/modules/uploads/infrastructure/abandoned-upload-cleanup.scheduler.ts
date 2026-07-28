import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  ABANDONED_UPLOAD_CLEANUP_JOB_NAME,
  ABANDONED_UPLOAD_CLEANUP_JOB_SCHEDULER_ID,
  ABANDONED_UPLOAD_CLEANUP_QUEUE,
} from './abandoned-upload-cleanup.queue';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Registers the repeatable cleanup job on boot. `upsertJobScheduler` is idempotent by
 * `jobSchedulerId` — restarting the API doesn't pile up duplicate repeatable jobs the way calling
 * `queue.add(..., { repeat })` on every boot would. Runs hourly rather than daily (unlike
 * TrashCleanupScheduler) — an abandoned reservation blocks a real user's quota for as long as it
 * sits unswept, so it's worth checking more often than a matter of retention-window days. */
@Injectable()
export class AbandonedUploadCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(AbandonedUploadCleanupScheduler.name);

  constructor(
    @InjectQueue(ABANDONED_UPLOAD_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      ABANDONED_UPLOAD_CLEANUP_JOB_SCHEDULER_ID,
      { every: ONE_HOUR_MS },
      { name: ABANDONED_UPLOAD_CLEANUP_JOB_NAME },
    );
    this.logger.log('Abandoned-upload cleanup job scheduled to run every 1h');
  }
}
