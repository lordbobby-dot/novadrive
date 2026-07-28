import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  TRASH_CLEANUP_JOB_NAME,
  TRASH_CLEANUP_JOB_SCHEDULER_ID,
  TRASH_CLEANUP_QUEUE,
} from './trash-cleanup.queue';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Registers the repeatable cleanup job on boot. `upsertJobScheduler` is idempotent by
 * `jobSchedulerId` — restarting the API doesn't pile up duplicate repeatable jobs the way calling
 * `queue.add(..., { repeat })` on every boot would. */
@Injectable()
export class TrashCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(TrashCleanupScheduler.name);

  constructor(
    @InjectQueue(TRASH_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      TRASH_CLEANUP_JOB_SCHEDULER_ID,
      { every: ONE_DAY_MS },
      { name: TRASH_CLEANUP_JOB_NAME },
    );
    this.logger.log('Trash cleanup job scheduled to run every 24h');
  }
}
