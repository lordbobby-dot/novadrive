import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import { UPLOAD_ABORTED } from '../domain/upload-events';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import { QuotaService } from '../../quota/domain/quota.service';

@Injectable()
export class AbortUploadUseCase {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly realtimeEmitter: RealtimeEmitter,
    private readonly quota: QuotaService,
  ) {}

  async execute(uploadId: string, ownerId: string): Promise<void> {
    const session = await this.uploads.findById(uploadId, ownerId);
    if (!session) {
      throw new NotFoundException('Upload not found');
    }

    if (
      session.uploadId &&
      (session.status === 'UPLOADING' || session.status === 'PENDING')
    ) {
      await this.storage.abortMultipartUpload({
        bucket: session.bucket,
        objectKey: session.objectKey,
        uploadId: session.uploadId,
      });
    }

    await this.uploads.markAborted(session.id);
    // The quota reserved at initiate time never became real usage — release it. Guarded to only
    // the two statuses whose reservation is still live: a session already COMPLETED/FAILED/
    // QUARANTINED/ABORTED has already had its reservation committed or released elsewhere, and
    // releasing it again here would double-free space that's either legitimately in use or was
    // already returned.
    if (
      session.quotaSubjectType &&
      (session.status === 'PENDING' || session.status === 'UPLOADING')
    ) {
      await this.quota.release(
        {
          subjectType: session.quotaSubjectType,
          subjectId: session.quotaSubjectId!,
        },
        session.size,
      );
    }

    this.realtimeEmitter.emitToUser(ownerId, UPLOAD_ABORTED, {
      uploadId: session.id,
    });
  }
}
