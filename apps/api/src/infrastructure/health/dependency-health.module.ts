import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StorageModule } from '../../modules/storage/storage.module';
import { CHECKSUM_VERIFICATION_QUEUE } from '../../modules/uploads/infrastructure/checksum-verification.queue';
import { DependencyHealthService } from './dependency-health.service';

/** A small, leaf module so both HealthModule (public GET /health/ready) and AdminModule (richer
 * admin-only GET /admin/system-health) can share the exact same Postgres/Redis/S3 check logic
 * without either importing the other, and without duplicating the queue/S3-client wiring
 * DependencyHealthService needs. */
@Module({
  imports: [
    StorageModule,
    BullModule.registerQueue({ name: CHECKSUM_VERIFICATION_QUEUE }),
  ],
  providers: [DependencyHealthService],
  exports: [DependencyHealthService],
})
export class DependencyHealthModule {}
