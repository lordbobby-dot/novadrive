import { NotFoundException } from '@nestjs/common';
import { AbortUploadUseCase } from './abort-upload.use-case';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import type { UploadSession } from '../domain/upload-session.entity';
import type { UploadRepository } from '../domain/upload.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { QuotaService } from '../../quota/domain/quota.service';

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
    totalParts: 2,
    clientChecksum: null,
    quotaSubjectType: null,
    quotaSubjectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AbortUploadUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let realtimeEmitter: RealtimeEmitter;
  let quota: jest.Mocked<QuotaService>;
  let useCase: AbortUploadUseCase;

  beforeEach(() => {
    uploads = {
      create: jest.fn(),
      findById: jest.fn(),
      setUploading: jest.fn(),
      addPart: jest.fn(),
      listParts: jest.fn(),
      recordETag: jest.fn(),
      markCompleted: jest.fn(),
      markAborted: jest.fn(),
      markFailed: jest.fn(),
      markQuarantined: jest.fn(),
      markChecksumVerified: jest.fn(),
      findStale: jest.fn(),
    };
    storage = {
      createMultipartUpload: jest.fn(),
      presignUploadParts: jest.fn(),
      completeMultipartUpload: jest.fn(),
      abortMultipartUpload: jest.fn(),
      getObjectStream: jest.fn(),
      deleteObject: jest.fn(),
      presignGetObject: jest.fn(),
      copyObject: jest.fn(),
    };
    realtimeEmitter = new RealtimeEmitter();
    jest.spyOn(realtimeEmitter, 'emitToUser');
    quota = {
      reserve: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<QuotaService>;
    useCase = new AbortUploadUseCase(uploads, storage, realtimeEmitter, quota);
  });

  it("throws NotFoundException when the upload doesn't exist", async () => {
    uploads.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('aborts the S3 multipart upload and marks the session aborted', async () => {
    uploads.findById.mockResolvedValue(makeSession());

    await useCase.execute('upload-1', 'owner-1');

    expect(storage.abortMultipartUpload).toHaveBeenCalledWith({
      bucket: 'novadrive-dev',
      objectKey: 'uploads/owner-1/abc',
      uploadId: 's3-upload-id',
    });
    expect(uploads.markAborted).toHaveBeenCalledWith('upload-1');
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'upload:aborted',
      { uploadId: 'upload-1' },
    );
  });

  it("doesn't call S3 abort for an upload that never got an S3 uploadId", async () => {
    uploads.findById.mockResolvedValue(
      makeSession({ uploadId: null, status: 'PENDING' }),
    );

    await useCase.execute('upload-1', 'owner-1');

    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(uploads.markAborted).toHaveBeenCalledWith('upload-1');
  });

  it('releases the reserved quota for a live (PENDING/UPLOADING) session', async () => {
    uploads.findById.mockResolvedValue(
      makeSession({ quotaSubjectType: 'USER', quotaSubjectId: 'owner-1' }),
    );

    await useCase.execute('upload-1', 'owner-1');

    expect(quota.release).toHaveBeenCalledWith(
      { subjectType: 'USER', subjectId: 'owner-1' },
      '1024',
    );
  });

  it("doesn't release quota for an already-terminal (COMPLETED) session", async () => {
    uploads.findById.mockResolvedValue(
      makeSession({
        status: 'COMPLETED',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      }),
    );

    await useCase.execute('upload-1', 'owner-1');

    expect(quota.release).not.toHaveBeenCalled();
  });

  it("doesn't re-abort an already-terminal upload in S3", async () => {
    uploads.findById.mockResolvedValue(makeSession({ status: 'COMPLETED' }));

    await useCase.execute('upload-1', 'owner-1');

    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(uploads.markAborted).toHaveBeenCalledWith('upload-1');
  });
});
