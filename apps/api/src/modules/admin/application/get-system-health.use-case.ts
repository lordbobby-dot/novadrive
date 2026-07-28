import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  DependencyHealthService,
  type HealthCheckResult,
} from '../../../infrastructure/health/dependency-health.service';
import { CHECKSUM_VERIFICATION_QUEUE } from '../../uploads/infrastructure/checksum-verification.queue';
import { TRASH_CLEANUP_QUEUE } from '../../trash/infrastructure/trash-cleanup.queue';

export type { HealthCheckResult };

export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface SystemHealthResult {
  database: HealthCheckResult;
  redis: HealthCheckResult;
  s3: HealthCheckResult;
  queues: QueueMetrics[];
  checkedAt: Date;
}

/** Layers admin-specific richness (per-queue depth) on top of DependencyHealthService's shared
 * Postgres/Redis/S3 checks — see docs/observability.md for why the checks themselves live there
 * now rather than being duplicated here (this was the first, M13-era version of that logic,
 * extracted in M14 once GET /health/ready needed the identical checks). */
@Injectable()
export class GetSystemHealthUseCase {
  constructor(
    private readonly dependencyHealth: DependencyHealthService,
    @InjectQueue(CHECKSUM_VERIFICATION_QUEUE)
    private readonly checksumQueue: Queue,
    @InjectQueue(TRASH_CLEANUP_QUEUE) private readonly trashQueue: Queue,
  ) {}

  async execute(): Promise<SystemHealthResult> {
    const [database, redis, s3, queues] = await Promise.all([
      this.dependencyHealth.checkDatabase(),
      this.dependencyHealth.checkRedis(),
      this.dependencyHealth.checkS3(),
      this.getQueueMetrics(),
    ]);
    return { database, redis, s3, queues, checkedAt: new Date() };
  }

  private async getQueueMetrics(): Promise<QueueMetrics[]> {
    return Promise.all(
      [this.checksumQueue, this.trashQueue].map(async (queue) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'failed',
          'delayed',
        );
        return {
          name: queue.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }),
    );
  }
}
