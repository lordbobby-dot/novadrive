import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import {
  TRASH_REPOSITORY,
  type TrashRepository,
} from '../domain/trash.repository';
import { computeRetentionCutoff } from '../domain/retention';
import { PermanentDeleteFileUseCase } from './permanent-delete-file.use-case';
import { PermanentDeleteFolderUseCase } from './permanent-delete-folder.use-case';

/** Run by the repeatable BullMQ job (see infrastructure/trash-cleanup.processor.ts). Purges every
 * root trash entry older than TRASH_RETENTION_DAYS — purging a root cascades to its whole
 * subtree, so descendants never need to be swept individually. One item's failure (e.g. a
 * transient S3 error) is logged and skipped rather than aborting the rest of the sweep. */
@Injectable()
export class PurgeExpiredTrashUseCase {
  private readonly logger = new Logger(PurgeExpiredTrashUseCase.name);

  constructor(
    @Inject(TRASH_REPOSITORY) private readonly trash: TrashRepository,
    private readonly permanentDeleteFile: PermanentDeleteFileUseCase,
    private readonly permanentDeleteFolder: PermanentDeleteFolderUseCase,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async execute(): Promise<{ purged: number; failed: number }> {
    const retentionDays = this.config.get('TRASH_RETENTION_DAYS', {
      infer: true,
    });
    const cutoff = computeRetentionCutoff(new Date(), retentionDays);
    const expired = await this.trash.findExpiredRoots(cutoff);

    let purged = 0;
    let failed = 0;
    for (const item of expired) {
      try {
        if (item.type === 'file') {
          await this.permanentDeleteFile.execute(item.id, item.ownerId);
        } else {
          await this.permanentDeleteFolder.execute(item.id, item.ownerId);
        }
        purged += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Failed to purge expired ${item.type} ${item.id}: ${String(error)}`,
        );
      }
    }

    return { purged, failed };
  }
}
