import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { CHECKSUM_VERIFICATION_QUEUE } from '../../modules/uploads/infrastructure/checksum-verification.queue';
import { TRASH_CLEANUP_QUEUE } from '../../modules/trash/infrastructure/trash-cleanup.queue';
import { MetricsService } from './metrics.service';

const POLL_INTERVAL_MS = 15_000;
const STATES = ['waiting', 'active', 'failed', 'delayed'] as const;

/** Polls BullMQ's own job counts on an interval and writes them into the `queue_depth` gauge —
 * simplest way to get queue-depth metrics without hooking every individual add/process/complete
 * call site. Registers the same two named queues a second time (see AdminModule for the
 * identical, already-established pattern and rationale: same queue name/Redis connection, a
 * second DI handle, no need to import UploadsModule/TrashModule's larger dependency trees). */
@Injectable()
export class QueueMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(CHECKSUM_VERIFICATION_QUEUE)
    private readonly checksumQueue: Queue,
    @InjectQueue(TRASH_CLEANUP_QUEUE) private readonly trashQueue: Queue,
  ) {}

  onModuleInit(): void {
    void this.poll();
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async poll(): Promise<void> {
    for (const queue of [this.checksumQueue, this.trashQueue]) {
      const counts = await queue.getJobCounts(...STATES).catch(() => null);
      if (!counts) continue;
      for (const state of STATES) {
        this.metrics.queueDepth.set(
          { queue: queue.name, state },
          counts[state] ?? 0,
        );
      }
    }
  }
}
