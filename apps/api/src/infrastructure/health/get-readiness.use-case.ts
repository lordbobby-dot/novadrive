import { Injectable } from '@nestjs/common';
import {
  DependencyHealthService,
  type HealthCheckResult,
} from './dependency-health.service';

export interface ReadinessResult {
  status: 'ok' | 'unhealthy';
  database: HealthCheckResult;
  redis: HealthCheckResult;
  s3: HealthCheckResult;
}

@Injectable()
export class GetReadinessUseCase {
  constructor(private readonly dependencyHealth: DependencyHealthService) {}

  async execute(): Promise<ReadinessResult> {
    const [database, redis, s3] = await Promise.all([
      this.dependencyHealth.checkDatabase(),
      this.dependencyHealth.checkRedis(),
      this.dependencyHealth.checkS3(),
    ]);

    const allUp = [database, redis, s3].every((check) => check.status === 'up');

    return { status: allUp ? 'ok' : 'unhealthy', database, redis, s3 };
  }
}
