import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import type { EnvConfig } from '../../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { S3_CLIENT } from '../../modules/storage/infrastructure/s3-client.provider';
import { CHECKSUM_VERIFICATION_QUEUE } from '../../modules/uploads/infrastructure/checksum-verification.queue';

export interface HealthCheckResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/** The one place Postgres/Redis/S3 connectivity is actually checked — originally built inline in
 * Milestone 13's admin-only `GET /admin/system-health` (which additionally reports BullMQ queue
 * depth, so it stays its own use case layered on top of this). Milestone 14's public
 * `GET /health/ready` is the "eventual real readiness probe" M13's own docs said would land here
 * — extracted so neither endpoint duplicates the check logic. Only needs one queue (not both) to
 * establish Redis is reachable — reusing the queue's own connection rather than opening a
 * dedicated one, same rationale as AdminModule's queue re-registration. */
@Injectable()
export class DependencyHealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(CHECKSUM_VERIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'down', error: errorMessage(error) };
    }
  }

  async checkRedis(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // IRedisClient (BullMQ's client abstraction over ioredis/node-redis/Bun) has no `ping`,
      // but every adapter implements `info` — a real round trip that fails identically if the
      // connection is down.
      const client = await this.queue.client;
      await client.info();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'down', error: errorMessage(error) };
    }
  }

  async checkS3(): Promise<HealthCheckResult> {
    const bucket = this.config.get('AWS_S3_BUCKET', { infer: true });
    if (!bucket) {
      return { status: 'down', error: 'AWS_S3_BUCKET is not configured' };
    }
    const start = Date.now();
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'down', error: errorMessage(error) };
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
