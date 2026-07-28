import { ApiProperty } from '@nestjs/swagger';
import type {
  HealthCheckResult,
  QueueMetrics,
  SystemHealthResult,
} from '../../application/get-system-health.use-case';

export class HealthCheckResultDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status!: 'up' | 'down';

  @ApiProperty({ required: false })
  latencyMs?: number;

  @ApiProperty({ required: false })
  error?: string;
}

export class QueueMetricsDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  waiting!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  delayed!: number;
}

export class SystemHealthResponseDto {
  @ApiProperty({ type: HealthCheckResultDto })
  database!: HealthCheckResultDto;

  @ApiProperty({ type: HealthCheckResultDto })
  redis!: HealthCheckResultDto;

  @ApiProperty({ type: HealthCheckResultDto })
  s3!: HealthCheckResultDto;

  @ApiProperty({ type: [QueueMetricsDto] })
  queues!: QueueMetricsDto[];

  @ApiProperty()
  checkedAt!: Date;

  static fromDomain(result: SystemHealthResult): SystemHealthResponseDto {
    const dto = new SystemHealthResponseDto();
    dto.database = toCheckDto(result.database);
    dto.redis = toCheckDto(result.redis);
    dto.s3 = toCheckDto(result.s3);
    dto.queues = result.queues.map(toQueueDto);
    dto.checkedAt = result.checkedAt;
    return dto;
  }
}

function toCheckDto(check: HealthCheckResult): HealthCheckResultDto {
  const dto = new HealthCheckResultDto();
  dto.status = check.status;
  dto.latencyMs = check.latencyMs;
  dto.error = check.error;
  return dto;
}

function toQueueDto(queue: QueueMetrics): QueueMetricsDto {
  const dto = new QueueMetricsDto();
  dto.name = queue.name;
  dto.waiting = queue.waiting;
  dto.active = queue.active;
  dto.failed = queue.failed;
  dto.delayed = queue.delayed;
  return dto;
}
