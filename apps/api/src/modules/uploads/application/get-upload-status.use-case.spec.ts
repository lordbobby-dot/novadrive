import { NotFoundException } from '@nestjs/common';
import { GetUploadStatusUseCase } from './get-upload-status.use-case';
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
    totalParts: 2,
    clientChecksum: null,
    quotaSubjectType: null,
    quotaSubjectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GetUploadStatusUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let useCase: GetUploadStatusUseCase;

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
    useCase = new GetUploadStatusUseCase(uploads);
  });

  it("throws NotFoundException when the upload doesn't exist", async () => {
    uploads.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the session with its completed parts', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    uploads.listParts.mockResolvedValue([
      { partNumber: 1, eTag: 'e1', size: '512' },
    ]);

    const result = await useCase.execute('upload-1', 'owner-1');

    expect(result.session.status).toBe('UPLOADING');
    expect(result.parts).toEqual([{ partNumber: 1, eTag: 'e1', size: '512' }]);
  });
});
