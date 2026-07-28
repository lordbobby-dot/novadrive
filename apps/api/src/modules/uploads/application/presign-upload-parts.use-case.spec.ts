import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PresignUploadPartsUseCase } from './presign-upload-parts.use-case';
import type { UploadSession } from '../domain/upload-session.entity';
import type { UploadRepository } from '../domain/upload.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';

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

describe('PresignUploadPartsUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let useCase: PresignUploadPartsUseCase;

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
    useCase = new PresignUploadPartsUseCase(uploads, storage);
  });

  it("throws NotFoundException when the upload doesn't exist (or isn't owned by the caller)", async () => {
    uploads.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        uploadId: 'missing',
        ownerId: 'owner-1',
        partNumbers: [1],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects when the upload isn't in progress", async () => {
    uploads.findById.mockResolvedValue(makeSession({ status: 'COMPLETED' }));
    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        partNumbers: [1],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects part numbers outside the valid range', async () => {
    uploads.findById.mockResolvedValue(makeSession({ totalParts: 3 }));
    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        partNumbers: [4],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('presigns the requested parts', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    storage.presignUploadParts.mockResolvedValue([
      { partNumber: 2, url: 'https://signed.example/part2' },
      { partNumber: 3, url: 'https://signed.example/part3' },
    ]);

    const result = await useCase.execute({
      uploadId: 'upload-1',
      ownerId: 'owner-1',
      partNumbers: [2, 3],
    });

    expect(storage.presignUploadParts).toHaveBeenCalledWith({
      bucket: 'novadrive-dev',
      objectKey: 'uploads/owner-1/abc',
      uploadId: 's3-upload-id',
      partNumbers: [2, 3],
    });
    expect(result).toHaveLength(2);
  });
});
