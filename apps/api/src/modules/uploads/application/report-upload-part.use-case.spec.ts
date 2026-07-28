import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportUploadPartUseCase } from './report-upload-part.use-case';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import type { UploadSession } from '../domain/upload-session.entity';
import type { UploadRepository } from '../domain/upload.repository';

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: 'upload-1',
    ownerId: 'owner-1',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/abc',
    contentType: 'application/pdf',
    size: '1024',
    status: 'UPLOADING',
    uploadId: 's3-upload-id',
    partSize: '1024',
    totalParts: 3,
    clientChecksum: null,
    quotaSubjectType: null,
    quotaSubjectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ReportUploadPartUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let realtimeEmitter: RealtimeEmitter;
  let useCase: ReportUploadPartUseCase;

  beforeEach(() => {
    uploads = {
      create: jest.fn(),
      findById: jest.fn(),
      setUploading: jest.fn(),
      addPart: jest.fn(),
      listParts: jest.fn().mockResolvedValue([]),
      recordETag: jest.fn(),
      markCompleted: jest.fn(),
      markAborted: jest.fn(),
      markFailed: jest.fn(),
      markQuarantined: jest.fn(),
      markChecksumVerified: jest.fn(),
      findStale: jest.fn(),
    };
    realtimeEmitter = new RealtimeEmitter();
    jest.spyOn(realtimeEmitter, 'emitToUser');
    useCase = new ReportUploadPartUseCase(uploads, realtimeEmitter);
  });

  it("throws NotFoundException when the upload doesn't exist (or isn't owned by the caller)", async () => {
    uploads.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        uploadId: 'missing',
        ownerId: 'owner-1',
        partNumber: 1,
        eTag: 'etag',
        size: '100',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects when the upload isn't in progress", async () => {
    uploads.findById.mockResolvedValue(makeSession({ status: 'ABORTED' }));
    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        partNumber: 1,
        eTag: 'etag',
        size: '100',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records the completed part idempotently', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    uploads.listParts.mockResolvedValue([
      { partNumber: 1, eTag: 'etag-1', size: '512' },
      { partNumber: 2, eTag: 'etag-2', size: '512' },
    ]);
    await useCase.execute({
      uploadId: 'upload-1',
      ownerId: 'owner-1',
      partNumber: 2,
      eTag: 'etag-2',
      size: '512',
    });

    expect(uploads.addPart).toHaveBeenCalledWith({
      storageObjectId: 'upload-1',
      partNumber: 2,
      eTag: 'etag-2',
      size: '512',
    });
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'upload:progress',
      { uploadId: 'upload-1', completedParts: 2, totalParts: 3 },
    );
  });
});
