import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { trace } from '@opentelemetry/api';
import { PinoLogger } from 'nestjs-pino';
import { PurgeExpiredTrashUseCase } from '../application/purge-expired-trash.use-case';
import { TRASH_CLEANUP_QUEUE } from './trash-cleanup.queue';

const tracer = trace.getTracer('novadrive-bullmq');

/** Cron-triggered, not spawned by any HTTP request — so there's no originating correlation id to
 * inherit. Each run still gets its own synthetic one so every log line from a single cleanup
 * pass can be correlated together, same shape as request-triggered work even though the
 * "traceable back to an HTTP request" half of the guarantee doesn't apply here. */
@Processor(TRASH_CLEANUP_QUEUE)
export class TrashCleanupProcessor extends WorkerHost {
  constructor(
    private readonly purgeExpiredTrash: PurgeExpiredTrashUseCase,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(TrashCleanupProcessor.name);
  }

  async process(): Promise<void> {
    const correlationId = randomUUID();
    await tracer.startActiveSpan(
      'trash-cleanup.process',
      { attributes: { correlationId } },
      async (span) => {
        try {
          const { purged, failed } = await this.purgeExpiredTrash.execute();
          this.logger.info(
            { correlationId, purged, failed },
            `Trash cleanup: purged ${purged}, failed ${failed}`,
          );
        } finally {
          span.end();
        }
      },
    );
  }
}
