import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InitiateUploadUseCase } from './initiate-upload.use-case';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import type { EnvConfig } from '../../../config/env.validation';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { UploadSession } from '../domain/upload-session.entity';
import type { UploadRepository } from '../domain/upload.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { QuotaService } from '../../quota/domain/quota.service';
import { QuotaExceededException } from '../../quota/domain/quota-exceeded.exception';

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
    status: 'PENDING',
    uploadId: null,
    partSize: '1024',
    totalParts: 1,
    clientChecksum: null,
    quotaSubjectType: null,
    quotaSubjectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('InitiateUploadUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let config: ConfigService<EnvConfig, true>;
  let realtimeEmitter: RealtimeEmitter;
  let quota: jest.Mocked<QuotaService>;
  let useCase: InitiateUploadUseCase;

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
    config = {
      get: jest.fn((key: string) => {
        if (key === 'AWS_S3_BUCKET') return 'novadrive-dev';
        if (key === 'AWS_REGION') return 'ap-south-1';
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;

    realtimeEmitter = new RealtimeEmitter();
    jest.spyOn(realtimeEmitter, 'emitToUser');
    quota = {
      reserve: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<QuotaService>;
    useCase = new InitiateUploadUseCase(
      uploads,
      folders,
      storage,
      config,
      realtimeEmitter,
      quota,
    );
  });

  it("throws NotFoundException when the destination folder doesn't exist", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        folderId: 'missing',
        name: 'report.pdf',
        contentType: 'application/pdf',
        size: '1024',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid uploads before touching S3', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'virus.exe',
        contentType: 'application/octet-stream',
        size: '1024',
      }),
    ).rejects.toThrow();
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('creates the session, initiates S3 multipart upload, and presigns the first batch of parts', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    uploads.create.mockResolvedValue(makeSession());
    storage.createMultipartUpload.mockResolvedValue({
      uploadId: 's3-upload-id',
    });
    uploads.setUploading.mockResolvedValue(
      makeSession({ status: 'UPLOADING', uploadId: 's3-upload-id' }),
    );
    storage.presignUploadParts.mockResolvedValue([
      { partNumber: 1, url: 'https://signed.example/part1' },
    ]);

    const result = await useCase.execute({
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: '1024',
    });

    expect(storage.createMultipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'novadrive-dev',
        contentType: 'application/pdf',
      }),
    );
    expect(uploads.setUploading).toHaveBeenCalledWith(
      'upload-1',
      's3-upload-id',
    );
    expect(result.parts).toEqual([
      { partNumber: 1, url: 'https://signed.example/part1' },
    ]);
    expect(result.totalParts).toBe(1);
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'upload:started',
      {
        uploadId: 'upload-1',
        name: 'report.pdf',
        folderId: 'folder-1',
        size: '1024',
      },
    );
  });

  it("reserves quota against the target folder's owner before touching S3", async () => {
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ ownerId: 'folder-owner-1' }),
    );
    uploads.create.mockResolvedValue(makeSession());
    storage.createMultipartUpload.mockResolvedValue({
      uploadId: 's3-upload-id',
    });
    uploads.setUploading.mockResolvedValue(
      makeSession({ status: 'UPLOADING' }),
    );
    storage.presignUploadParts.mockResolvedValue([]);

    await useCase.execute({
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: '2048',
    });

    expect(quota.reserve).toHaveBeenCalledWith(
      { subjectType: 'USER', subjectId: 'folder-owner-1' },
      '2048',
    );
    expect(uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quotaSubjectType: 'USER',
        quotaSubjectId: 'folder-owner-1',
      }),
    );
  });

  it('reserves quota against the organization when the target folder is workspace-scoped', async () => {
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ organizationId: 'org-1', workspaceId: 'ws-1' }),
    );
    uploads.create.mockResolvedValue(makeSession());
    storage.createMultipartUpload.mockResolvedValue({
      uploadId: 's3-upload-id',
    });
    uploads.setUploading.mockResolvedValue(
      makeSession({ status: 'UPLOADING' }),
    );
    storage.presignUploadParts.mockResolvedValue([]);

    await useCase.execute({
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: '2048',
    });

    expect(quota.reserve).toHaveBeenCalledWith(
      { subjectType: 'ORGANIZATION', subjectId: 'org-1' },
      '2048',
    );
  });

  it('rejects the upload before creating a multipart upload when quota is exceeded', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    quota.reserve.mockRejectedValue(new QuotaExceededException());

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'report.pdf',
        contentType: 'application/pdf',
        size: '2048',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    expect(uploads.create).not.toHaveBeenCalled();
  });
});
