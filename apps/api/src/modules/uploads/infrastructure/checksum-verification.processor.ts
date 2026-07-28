import { Processor, WorkerHost } from '@nestjs/bullmq';
import { trace } from '@opentelemetry/api';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { VerifyChecksumUseCase } from '../application/verify-checksum.use-case';
import {
  CHECKSUM_VERIFICATION_QUEUE,
  type ChecksumVerificationJob,
} from './checksum-verification.queue';

const tracer = trace.getTracer('novadrive-bullmq');

/** Every log line for this job includes `correlationId` (see PinoLogger.setContext/assign below)
 * — the same id the originating `POST /uploads/:id/complete` request logged, traceable end to
 * end without any request-scoped DI. A manual span wraps the whole job: no official BullMQ
 * OpenTelemetry instrumentation package exists, so this is the job-level tracing granularity;
 * the underlying ioredis calls BullMQ itself makes are still auto-instrumented (see
 * src/tracing.ts). */
@Processor(CHECKSUM_VERIFICATION_QUEUE)
export class ChecksumVerificationProcessor extends WorkerHost {
  constructor(
    private readonly verifyChecksum: VerifyChecksumUseCase,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(ChecksumVerificationProcessor.name);
  }

  async process(job: Job<ChecksumVerificationJob>): Promise<void> {
    const { correlationId, storageObjectId } = job.data;
    await tracer.startActiveSpan(
      'checksum-verification.process',
      { attributes: { correlationId, storageObjectId } },
      async (span) => {
        try {
          this.logger.info(
            { correlationId, storageObjectId },
            `Verifying upload ${storageObjectId}`,
          );
          await this.verifyChecksum.execute(job.data);
        } finally {
          span.end();
        }
      },
    );
  }
}
