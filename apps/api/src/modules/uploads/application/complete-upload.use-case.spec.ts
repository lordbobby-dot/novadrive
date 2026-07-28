import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { CompleteUploadUseCase } from './complete-upload.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { UploadSession } from '../domain/upload-session.entity';
import type { UploadRepository } from '../domain/upload.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { ChecksumVerificationJob } from '../infrastructure/checksum-verification.queue';

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-1',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/existing',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Docs',
    ownerId: 'owner-1',
    parentId: null,
    path: '/',
    depth: 0,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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

describe('CompleteUploadUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let queue: jest.Mocked<Queue<ChecksumVerificationJob>>;
  let useCase: CompleteUploadUseCase;

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
    folders = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findRoot: jest.fn(),
      createRoot: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      findChildren: jest.fn(),
      findDescendantIds: jest.fn(),
      move: jest.fn(),
      softDeleteSubtree: jest.fn(),
      isTrashed: jest.fn(),
      restoreSubtree: jest.fn(),
      deleteRow: jest.fn(),
      createWorkspaceRoot: jest.fn(),
      findWorkspaceRoot: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    files = {
      findById: jest.fn(),
      create: jest.fn(),
      createFromStorageObject: jest.fn(),
      rename: jest.fn(),
      findByFolder: jest.fn(),
      move: jest.fn(),
      copyToNewStorageObject: jest.fn(),
      softDelete: jest.fn(),
      softDeleteByFolderIds: jest.fn(),
      restore: jest.fn(),
      restoreByFolderIds: jest.fn(),
      findByFolderIds: jest.fn(),
      updateCurrentStorageObject: jest.fn(),
      touchLastAccessed: jest.fn(),
      isTrashed: jest.fn(),
      findByIdUnscoped: jest.fn(),
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
    queue = { add: jest.fn() } as unknown as jest.Mocked<
      Queue<ChecksumVerificationJob>
    >;
    useCase = new CompleteUploadUseCase(
      uploads,
      folders,
      files,
      storage,
      queue,
    );
  });

  it("throws NotFoundException when the upload doesn't exist", async () => {
    uploads.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        uploadId: 'missing',
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'report.pdf',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects when the upload isn't in progress", async () => {
    uploads.findById.mockResolvedValue(makeSession({ status: 'COMPLETED' }));
    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'report.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFoundException when the destination folder doesn't exist", async () => {
    uploads.findById.mockResolvedValue(makeSession());
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        folderId: 'missing',
        name: 'report.pdf',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when not all parts have been reported yet', async () => {
    uploads.findById.mockResolvedValue(makeSession({ totalParts: 3 }));
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    uploads.listParts.mockResolvedValue([
      { partNumber: 1, eTag: 'e1', size: '512' },
    ]);

    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'report.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('completes the S3 upload, records the ETag, and enqueues checksum verification', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    uploads.listParts.mockResolvedValue([
      { partNumber: 1, eTag: 'e1', size: '512' },
      { partNumber: 2, eTag: 'e2', size: '512' },
    ]);
    storage.completeMultipartUpload.mockResolvedValue({ eTag: 'final-etag' });

    const result = await useCase.execute({
      uploadId: 'upload-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
    });

    expect(uploads.recordETag).toHaveBeenCalledWith('upload-1', 'final-etag');
    expect(queue.add).toHaveBeenCalledWith('verify', {
      storageObjectId: 'upload-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      versionOfFileId: undefined,
    });
    expect(result.status).toBe('VERIFYING');
  });

  it('threads the correlation ID from the request into the checksum-verification job payload', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    uploads.listParts.mockResolvedValue([
      { partNumber: 1, eTag: 'e1', size: '512' },
      { partNumber: 2, eTag: 'e2', size: '512' },
    ]);
    storage.completeMultipartUpload.mockResolvedValue({ eTag: 'final-etag' });

    await useCase.execute({
      uploadId: 'upload-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      correlationId: 'req-abc-123',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'verify',
      expect.objectContaining({ correlationId: 'req-abc-123' }),
    );
  });

  it('rejects when neither versionOfFileId nor folderId+name are provided', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    await expect(
      useCase.execute({ uploadId: 'upload-1', ownerId: 'owner-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.findByIdUnscoped).not.toHaveBeenCalled();
    expect(files.findByIdUnscoped).not.toHaveBeenCalled();
  });

  it('completes against an existing file when versionOfFileId is provided', async () => {
    uploads.findById.mockResolvedValue(makeSession());
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    uploads.listParts.mockResolvedValue([
      { partNumber: 1, eTag: 'e1', size: '512' },
      { partNumber: 2, eTag: 'e2', size: '512' },
    ]);
    storage.completeMultipartUpload.mockResolvedValue({ eTag: 'final-etag' });

    const result = await useCase.execute({
      uploadId: 'upload-1',
      ownerId: 'owner-1',
      versionOfFileId: 'file-1',
    });

    expect(folders.findByIdUnscoped).not.toHaveBeenCalled();
    expect(files.findByIdUnscoped).toHaveBeenCalledWith('file-1');
    expect(queue.add).toHaveBeenCalledWith('verify', {
      storageObjectId: 'upload-1',
      ownerId: 'owner-1',
      folderId: undefined,
      name: undefined,
      versionOfFileId: 'file-1',
    });
    expect(result.status).toBe('VERIFYING');
  });

  it("throws NotFoundException when versionOfFileId doesn't resolve to an owned file", async () => {
    uploads.findById.mockResolvedValue(makeSession());
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        uploadId: 'upload-1',
        ownerId: 'owner-1',
        versionOfFileId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
