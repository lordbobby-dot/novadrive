import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { trace } from '@opentelemetry/api';
import { PinoLogger } from 'nestjs-pino';
import { PurgeAbandonedUploadsUseCase } from '../application/purge-abandoned-uploads.use-case';
import { ABANDONED_UPLOAD_CLEANUP_QUEUE } from './abandoned-upload-cleanup.queue';

const tracer = trace.getTracer('novadrive-bullmq');

/** Cron-triggered, not spawned by any HTTP request — so there's no originating correlation id to
 * inherit. Each run still gets its own synthetic one, same shape as TrashCleanupProcessor. */
@Processor(ABANDONED_UPLOAD_CLEANUP_QUEUE)
export class AbandonedUploadCleanupProcessor extends WorkerHost {
  constructor(
    private readonly purgeAbandonedUploads: PurgeAbandonedUploadsUseCase,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(AbandonedUploadCleanupProcessor.name);
  }

  async process(): Promise<void> {
    const correlationId = randomUUID();
    await tracer.startActiveSpan(
      'abandoned-upload-cleanup.process',
      { attributes: { correlationId } },
      async (span) => {
        try {
          const { purged, failed } = await this.purgeAbandonedUploads.execute();
          this.logger.info(
            { correlationId, purged, failed },
            `Abandoned-upload cleanup: purged ${purged}, failed ${failed}`,
          );
        } finally {
          span.end();
        }
      },
    );
  }
}
