import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';
import { computeAbandonedUploadCutoff } from '../domain/staleness';
import { AbortUploadUseCase } from './abort-upload.use-case';

/** Run by the repeatable BullMQ job (see infrastructure/abandoned-upload-cleanup.processor.ts).
 * Aborts every upload session still PENDING/UPLOADING after ABANDONED_UPLOAD_STALE_HOURS —
 * reused via AbortUploadUseCase.execute rather than duplicating its abort-multipart-upload /
 * release-quota / mark-aborted sequence, since a GC sweep is just a client-initiated cancel the
 * client never got to issue. One session's failure (e.g. a transient S3 error) is logged and
 * skipped rather than aborting the rest of the sweep, same shape as PurgeExpiredTrashUseCase. */
@Injectable()
export class PurgeAbandonedUploadsUseCase {
  private readonly logger = new Logger(PurgeAbandonedUploadsUseCase.name);

  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    private readonly abortUpload: AbortUploadUseCase,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async execute(): Promise<{ purged: number; failed: number }> {
    const staleHours = this.config.get('ABANDONED_UPLOAD_STALE_HOURS', {
      infer: true,
    });
    const cutoff = computeAbandonedUploadCutoff(new Date(), staleHours);
    const stale = await this.uploads.findStale(cutoff);

    let purged = 0;
    let failed = 0;
    for (const session of stale) {
      try {
        await this.abortUpload.execute(session.id, session.ownerId);
        purged += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Failed to abort abandoned upload ${session.id}: ${String(error)}`,
        );
      }
    }

    return { purged, failed };
  }
}
