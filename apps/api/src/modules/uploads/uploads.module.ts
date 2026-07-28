import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageModule } from '../storage/storage.module';
import { VersionsModule } from '../versions/versions.module';
import { QuotaModule } from '../quota/quota.module';
import { UPLOAD_REPOSITORY } from './domain/upload.repository';
import { VIRUS_SCAN_ADAPTER } from './domain/virus-scan-adapter';
import { PrismaUploadRepository } from './infrastructure/prisma-upload.repository';
import { ClamAvClientProvider } from './infrastructure/clamav-client.provider';
import { ClamAvScanAdapter } from './infrastructure/clamav-scan-adapter';
import { ChecksumVerificationProcessor } from './infrastructure/checksum-verification.processor';
import { CHECKSUM_VERIFICATION_QUEUE } from './infrastructure/checksum-verification.queue';
import { ABANDONED_UPLOAD_CLEANUP_QUEUE } from './infrastructure/abandoned-upload-cleanup.queue';
import { AbandonedUploadCleanupProcessor } from './infrastructure/abandoned-upload-cleanup.processor';
import { AbandonedUploadCleanupScheduler } from './infrastructure/abandoned-upload-cleanup.scheduler';
import { InitiateUploadUseCase } from './application/initiate-upload.use-case';
import { PresignUploadPartsUseCase } from './application/presign-upload-parts.use-case';
import { ReportUploadPartUseCase } from './application/report-upload-part.use-case';
import { GetUploadStatusUseCase } from './application/get-upload-status.use-case';
import { CompleteUploadUseCase } from './application/complete-upload.use-case';
import { AbortUploadUseCase } from './application/abort-upload.use-case';
import { VerifyChecksumUseCase } from './application/verify-checksum.use-case';
import { PurgeAbandonedUploadsUseCase } from './application/purge-abandoned-uploads.use-case';
import { UploadsController } from './interface/uploads.controller';

@Module({
  imports: [
    FoldersModule,
    FilesModule,
    StorageModule,
    VersionsModule,
    RealtimeModule,
    QuotaModule,
    BullModule.registerQueue({ name: CHECKSUM_VERIFICATION_QUEUE }),
    BullModule.registerQueue({ name: ABANDONED_UPLOAD_CLEANUP_QUEUE }),
  ],
  controllers: [UploadsController],
  providers: [
    { provide: UPLOAD_REPOSITORY, useClass: PrismaUploadRepository },
    ClamAvClientProvider,
    { provide: VIRUS_SCAN_ADAPTER, useClass: ClamAvScanAdapter },
    InitiateUploadUseCase,
    PresignUploadPartsUseCase,
    ReportUploadPartUseCase,
    GetUploadStatusUseCase,
    CompleteUploadUseCase,
    AbortUploadUseCase,
    VerifyChecksumUseCase,
    ChecksumVerificationProcessor,
    PurgeAbandonedUploadsUseCase,
    AbandonedUploadCleanupProcessor,
    AbandonedUploadCleanupScheduler,
  ],
})
export class UploadsModule {}
