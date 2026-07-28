import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { ChecksumVerificationProcessor } from './checksum-verification.processor';
import type { VerifyChecksumUseCase } from '../application/verify-checksum.use-case';
import type { ChecksumVerificationJob } from './checksum-verification.queue';

function makeJob(data: ChecksumVerificationJob): Job<ChecksumVerificationJob> {
  return { data } as Job<ChecksumVerificationJob>;
}

describe('ChecksumVerificationProcessor', () => {
  let verifyChecksum: jest.Mocked<VerifyChecksumUseCase>;
  let logger: jest.Mocked<PinoLogger>;
  let processor: ChecksumVerificationProcessor;

  beforeEach(() => {
    verifyChecksum = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<VerifyChecksumUseCase>;
    logger = {
      setContext: jest.fn(),
      info: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>;
    processor = new ChecksumVerificationProcessor(verifyChecksum, logger);
  });

  it('carries the correlation ID from the job payload (set by the originating HTTP request) into every log line for the job', async () => {
    const job = makeJob({
      storageObjectId: 'storage-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      correlationId: 'req-abc-123',
    });

    await processor.process(job);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'req-abc-123' }),
      expect.any(String),
    );
    expect(verifyChecksum.execute).toHaveBeenCalledWith(job.data);
  });

  it('still processes the job when no correlation ID is present (e.g. a directly-enqueued job)', async () => {
    const job = makeJob({
      storageObjectId: 'storage-2',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
    });

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: undefined }),
      expect.any(String),
    );
  });
});
