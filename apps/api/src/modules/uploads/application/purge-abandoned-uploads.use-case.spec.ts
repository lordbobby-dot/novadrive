import type { ConfigService } from '@nestjs/config';
import { PurgeAbandonedUploadsUseCase } from './purge-abandoned-uploads.use-case';
import type { AbortUploadUseCase } from './abort-upload.use-case';
import type { UploadRepository } from '../domain/upload.repository';
import type { UploadSession } from '../domain/upload-session.entity';
import type { EnvConfig } from '../../../config/env.validation';

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: 'upload-1',
    ownerId: 'owner-1',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/x',
    contentType: 'text/plain',
    size: '1024',
    status: 'PENDING',
    uploadId: null,
    partSize: null,
    totalParts: null,
    clientChecksum: null,
    quotaSubjectType: null,
    quotaSubjectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PurgeAbandonedUploadsUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let abortUpload: jest.Mocked<AbortUploadUseCase>;
  let config: jest.Mocked<ConfigService<EnvConfig, true>>;
  let useCase: PurgeAbandonedUploadsUseCase;

  beforeEach(() => {
    uploads = {
      create: jest.fn(),
      findById: jest.fn(),
      findStale: jest.fn(),
      setUploading: jest.fn(),
      addPart: jest.fn(),
      listParts: jest.fn(),
      recordETag: jest.fn(),
      markCompleted: jest.fn(),
      markAborted: jest.fn(),
      markFailed: jest.fn(),
      markQuarantined: jest.fn(),
      markChecksumVerified: jest.fn(),
    };
    abortUpload = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AbortUploadUseCase>;
    config = {
      get: jest.fn().mockReturnValue(24),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    useCase = new PurgeAbandonedUploadsUseCase(uploads, abortUpload, config);
  });

  it('does nothing when nothing is stale', async () => {
    uploads.findStale.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual({ purged: 0, failed: 0 });
    expect(abortUpload.execute).not.toHaveBeenCalled();
  });

  it("aborts each stale session via AbortUploadUseCase, using the session's own owner", async () => {
    uploads.findStale.mockResolvedValue([
      makeSession({ id: 'upload-1', ownerId: 'owner-1' }),
      makeSession({ id: 'upload-2', ownerId: 'owner-2' }),
    ]);

    const result = await useCase.execute();

    expect(abortUpload.execute).toHaveBeenCalledWith('upload-1', 'owner-1');
    expect(abortUpload.execute).toHaveBeenCalledWith('upload-2', 'owner-2');
    expect(result).toEqual({ purged: 2, failed: 0 });
  });

  it("logs and continues past one session's failure rather than aborting the rest of the sweep", async () => {
    uploads.findStale.mockResolvedValue([
      makeSession({ id: 'upload-1' }),
      makeSession({ id: 'upload-2' }),
    ]);
    abortUpload.execute
      .mockRejectedValueOnce(new Error('S3 unreachable'))
      .mockResolvedValueOnce(undefined);

    const result = await useCase.execute();

    expect(abortUpload.execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ purged: 1, failed: 1 });
  });

  it('computes the cutoff from ABANDONED_UPLOAD_STALE_HOURS', async () => {
    uploads.findStale.mockResolvedValue([]);
    await useCase.execute();
    expect(config.get).toHaveBeenCalledWith('ABANDONED_UPLOAD_STALE_HOURS', {
      infer: true,
    });
  });
});
