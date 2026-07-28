import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';
import {
  VIRUS_SCAN_ADAPTER,
  type VirusScanAdapter,
} from '../domain/virus-scan-adapter';
import {
  FILE_VERSION_REPOSITORY,
  type FileVersionRepository,
} from '../../versions/domain/file-version.repository';
import { AddFileVersionUseCase } from '../../versions/application/add-file-version.use-case';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import { MetricsService } from '../../../infrastructure/metrics/metrics.service';
import { QuotaService } from '../../quota/domain/quota.service';
import type { QuotaSubjectType } from '../../quota/domain/storage-quota.entity';
import {
  UPLOAD_COMPLETED,
  UPLOAD_FAILED,
  UPLOAD_QUARANTINED,
} from '../domain/upload-events';
import type { ChecksumVerificationJob } from '../infrastructure/checksum-verification.queue';

@Injectable()
export class VerifyChecksumUseCase {
  private readonly logger = new Logger(VerifyChecksumUseCase.name);

  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
    @Inject(VIRUS_SCAN_ADAPTER)
    private readonly virusScan: VirusScanAdapter,
    private readonly addFileVersion: AddFileVersionUseCase,
    private readonly events: EventEmitter2,
    private readonly realtimeEmitter: RealtimeEmitter,
    private readonly quota: QuotaService,
    private readonly metrics: MetricsService,
  ) {}

  private async releaseQuotaReservation(session: {
    quotaSubjectType: QuotaSubjectType | null;
    quotaSubjectId: string | null;
    size: string;
  }): Promise<void> {
    if (!session.quotaSubjectType) return;
    await this.quota.release(
      {
        subjectType: session.quotaSubjectType,
        subjectId: session.quotaSubjectId!,
      },
      session.size,
    );
  }

  async execute(job: ChecksumVerificationJob): Promise<void> {
    const session = await this.uploads.findById(
      job.storageObjectId,
      job.ownerId,
    );
    if (!session) {
      this.logger.warn(
        `Upload ${job.storageObjectId} not found during checksum verification`,
      );
      return;
    }

    if (session.clientChecksum) {
      const actualChecksum = await this.computeChecksum(
        session.bucket,
        session.objectKey,
      );
      if (actualChecksum !== session.clientChecksum) {
        this.logger.warn(
          `Checksum mismatch for upload ${session.id}: expected ${session.clientChecksum}, got ${actualChecksum}`,
        );
        await this.uploads.markFailed(session.id);
        await this.releaseQuotaReservation(session);
        await this.storage
          .deleteObject({
            bucket: session.bucket,
            objectKey: session.objectKey,
          })
          .catch((error: unknown) => {
            this.logger.error(
              `Failed to clean up S3 object after checksum failure: ${String(error)}`,
            );
          });
        this.realtimeEmitter.emitToUser(job.ownerId, UPLOAD_FAILED, {
          uploadId: session.id,
          reason: 'checksum_mismatch',
        });
        return;
      }
      await this.uploads.markChecksumVerified(session.id, actualChecksum);
    }

    const scanStream = await this.storage.getObjectStream({
      bucket: session.bucket,
      objectKey: session.objectKey,
    });
    const scanResult = await this.virusScan.scanStream(scanStream);
    if (scanResult.infected) {
      this.logger.warn(
        `Virus detected in upload ${session.id}: ${scanResult.viruses.join(', ')}`,
      );
      // Kept in S3, not deleted — quarantine is a forensics/audit trail, not silent removal. No
      // File row is ever created for a QUARANTINED session, so it's structurally unreachable via
      // any download path regardless.
      await this.uploads.markQuarantined(session.id);
      // Released even though the S3 object itself is kept (not deleted) for forensics — quota
      // reflects usable Drive capacity, not raw bytes NovaDrive happens to be storing on the
      // account's behalf; a quarantined upload was never something the account could access.
      await this.releaseQuotaReservation(session);
      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'VIRUS_DETECTED',
          'FAILURE',
          job.ownerId,
          'FILE',
          session.id,
          { viruses: scanResult.viruses },
        ),
      );
      this.realtimeEmitter.emitToUser(job.ownerId, UPLOAD_QUARANTINED, {
        uploadId: session.id,
        viruses: scanResult.viruses,
      });
      return;
    }

    await this.uploads.markCompleted(session.id);
    this.metrics.uploadThroughputBytes.inc(Number(session.size));

    if (job.versionOfFileId) {
      await this.addFileVersion.execute({
        fileId: job.versionOfFileId,
        ownerId: job.ownerId,
        storageObjectId: session.id,
      });
      this.realtimeEmitter.emitToUser(job.ownerId, UPLOAD_COMPLETED, {
        uploadId: session.id,
        fileId: job.versionOfFileId,
        versionOfFileId: job.versionOfFileId,
      });
      return;
    }

    if (!job.folderId || !job.name) {
      this.logger.error(
        `Checksum job ${session.id} has neither versionOfFileId nor folderId+name`,
      );
      this.realtimeEmitter.emitToUser(job.ownerId, UPLOAD_FAILED, {
        uploadId: session.id,
        reason: 'invalid_completion_target',
      });
      return;
    }

    const file = await this.files.createFromStorageObject({
      ownerId: job.ownerId,
      folderId: job.folderId,
      name: job.name,
      storageObjectId: session.id,
    });
    // Every file gets an immutable version 1 pointing at the same object it was created with, so
    // the version-history UI works uniformly even for a file that's never been re-uploaded.
    await this.versions.create({
      fileId: file.id,
      storageObjectId: session.id,
      createdBy: job.ownerId,
    });
    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(job.ownerId, 'UPLOAD', 'FILE', file.id, {
        name: file.name,
      }),
    );
    this.realtimeEmitter.emitToUser(job.ownerId, UPLOAD_COMPLETED, {
      uploadId: session.id,
      fileId: file.id,
      name: file.name,
    });
  }

  private async computeChecksum(
    bucket: string,
    objectKey: string,
  ): Promise<string> {
    const stream = await this.storage.getObjectStream({ bucket, objectKey });
    const hash = createHash('sha256');
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }
}
