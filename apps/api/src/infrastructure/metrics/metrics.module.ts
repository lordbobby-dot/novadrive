import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { CHECKSUM_VERIFICATION_QUEUE } from '../../modules/uploads/infrastructure/checksum-verification.queue';
import { TRASH_CLEANUP_QUEUE } from '../../modules/trash/infrastructure/trash-cleanup.queue';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { QueueMetricsCollector } from './queue-metrics.collector';
import { MetricsController } from './metrics.controller';

/** Global so any module can inject MetricsService to record a domain-specific metric (e.g.
 * VerifyChecksumUseCase incrementing upload_throughput_bytes_total) without importing this
 * module explicitly — same rationale as PrismaModule/AuthModule being @Global(). */
@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: CHECKSUM_VERIFICATION_QUEUE },
      { name: TRASH_CLEANUP_QUEUE },
    ),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    QueueMetricsCollector,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
