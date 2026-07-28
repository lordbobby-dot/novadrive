import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { VerifyChecksumUseCase } from './verify-checksum.use-case';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { UploadSession } from '../domain/upload-session.entity';
import type { UploadRepository } from '../domain/upload.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { VirusScanAdapter } from '../domain/virus-scan-adapter';
import type { FileVersionRepository } from '../../versions/domain/file-version.repository';
import type { AddFileVersionUseCase } from '../../versions/application/add-file-version.use-case';
import type { QuotaService } from '../../quota/domain/quota.service';
import type { MetricsService } from '../../../infrastructure/metrics/metrics.service';

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: 'upload-1',
    ownerId: 'owner-1',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/abc',
    contentType: 'application/pdf',
    size: '11',
    status: 'UPLOADING',
    uploadId: 's3-upload-id',
    partSize: '11',
    totalParts: 1,
    clientChecksum: null,
    quotaSubjectType: null,
    quotaSubjectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'upload-1',
    contentType: 'application/pdf',
    size: '11',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/abc',
    region: 'ap-south-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VerifyChecksumUseCase', () => {
  let uploads: jest.Mocked<UploadRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let files: jest.Mocked<FileRepository>;
  let versions: jest.Mocked<FileVersionRepository>;
  let virusScan: jest.Mocked<VirusScanAdapter>;
  let addFileVersion: jest.Mocked<AddFileVersionUseCase>;
  let events: jest.Mocked<EventEmitter2>;
  let realtimeEmitter: RealtimeEmitter;
  let quota: jest.Mocked<QuotaService>;
  let metrics: jest.Mocked<MetricsService>;
  let useCase: VerifyChecksumUseCase;

  const fileContent = Buffer.from('hello world');
  const correctChecksum = createHash('sha256')
    .update(fileContent)
    .digest('hex');

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
      getObjectStream: jest
        .fn()
        .mockResolvedValue(Readable.from([fileContent])),
      deleteObject: jest.fn(),
      presignGetObject: jest.fn(),
      copyObject: jest.fn(),
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
    versions = {
      listByFile: jest.fn(),
      findByFileAndNumber: jest.fn(),
      create: jest.fn(),
      listStorageObjectIdsForFiles: jest.fn(),
    };
    virusScan = {
      scanStream: jest.fn().mockResolvedValue({ infected: false, viruses: [] }),
    };
    addFileVersion = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AddFileVersionUseCase>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    realtimeEmitter = new RealtimeEmitter();
    jest.spyOn(realtimeEmitter, 'emitToUser');
    quota = {
      reserve: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<QuotaService>;
    metrics = {
      uploadThroughputBytes: { inc: jest.fn() },
    } as unknown as jest.Mocked<MetricsService>;
    useCase = new VerifyChecksumUseCase(
      uploads,
      storage,
      files,
      versions,
      virusScan,
      addFileVersion,
      events,
      realtimeEmitter,
      quota,
      metrics,
    );
  });

  it('does nothing if the upload session can no longer be found', async () => {
    uploads.findById.mockResolvedValue(null);
    await useCase.execute({
      storageObjectId: 'missing',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'x',
    });
    expect(files.createFromStorageObject).not.toHaveBeenCalled();
  });

  it('marks completed and creates the File when no checksum was declared', async () => {
    uploads.findById.mockResolvedValue(makeSession({ clientChecksum: null }));
    files.createFromStorageObject.mockResolvedValue(makeFile());

    await useCase.execute({
      storageObjectId: 'upload-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
    });

    expect(virusScan.scanStream).toHaveBeenCalled();
    expect(uploads.markCompleted).toHaveBeenCalledWith('upload-1');
    expect(files.createFromStorageObject).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
      storageObjectId: 'upload-1',
    });
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'upload:completed',
      { uploadId: 'upload-1', fileId: 'file-1', name: 'report.pdf' },
    );
  });

  it('verifies a matching checksum, marks completed, and creates the File', async () => {
    uploads.findById.mockResolvedValue(
      makeSession({ clientChecksum: correctChecksum }),
    );
    files.createFromStorageObject.mockResolvedValue(makeFile());

    await useCase.execute({
      storageObjectId: 'upload-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
    });

    expect(uploads.markChecksumVerified).toHaveBeenCalledWith(
      'upload-1',
      correctChecksum,
    );
    expect(uploads.markCompleted).toHaveBeenCalledWith('upload-1');
    expect(files.createFromStorageObject).toHaveBeenCalled();
    expect(uploads.markFailed).not.toHaveBeenCalled();
  });

  it('marks failed, cleans up S3, releases quota, and never creates a File on checksum mismatch', async () => {
    uploads.findById.mockResolvedValue(
      makeSession({
        clientChecksum: 'deadbeef',
        quotaSubjectType: 'USER',
        quotaSubjectId: 'owner-1',
      }),
    );
    storage.deleteObject.mockResolvedValue(undefined);

    await useCase.execute({
      storageObjectId: 'upload-1',
      ownerId: 'owner-1',
      folderId: 'folder-1',
      name: 'report.pdf',
    });

    expect(uploads.markFailed).toHaveBeenCalledWith('upload-1');
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'novadrive-dev',
      objectKey: 'uploads/owner-1/abc',
    });
    expect(quota.release).toHaveBeenCalledWith(
      { subjectType: 'USER', subjectId: 'owner-1' },
      '11',
    );
    expect(virusScan.scanStream).not.toHaveBeenCalled();
    expect(uploads.markCompleted).not.toHaveBeenCalled();
    expect(files.createFromStorageObject).not.toHaveBeenCalled();
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'upload:failed',
      { uploadId: 'upload-1', reason: 'checksum_mismatch' },
    );
  });

  it('delegates to AddFileVersionUseCase instead of creating a File when versionOfFileId is set', async () => {
    uploads.findById.mockResolvedValue(makeSession({ clientChecksum: null }));

    await useCase.execute({
      storageObjectId: 'upload-1',
      ownerId: 'owner-1',
      versionOfFileId: 'file-1',
    });

    expect(uploads.markCompleted).toHaveBeenCalledWith('upload-1');
    expect(addFileVersion.execute).toHaveBeenCalledWith({
      fileId: 'file-1',
      ownerId: 'owner-1',
      storageObjectId: 'upload-1',
    });
    expect(files.createFromStorageObject).not.toHaveBeenCalled();
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'upload:completed',
      { uploadId: 'upload-1', fileId: 'file-1', versionOfFileId: 'file-1' },
    );
  });

  describe('virus scanning', () => {
    it('quarantines an infected upload, never creates a File, releases quota, and never marks completed', async () => {
      uploads.findById.mockResolvedValue(
        makeSession({
          clientChecksum: null,
          quotaSubjectType: 'USER',
          quotaSubjectId: 'owner-1',
        }),
      );
      virusScan.scanStream.mockResolvedValue({
        infected: true,
        viruses: ['Eicar-Test-Signature'],
      });

      await useCase.execute({
        storageObjectId: 'upload-1',
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'report.pdf',
      });

      expect(uploads.markQuarantined).toHaveBeenCalledWith('upload-1');
      expect(uploads.markCompleted).not.toHaveBeenCalled();
      expect(files.createFromStorageObject).not.toHaveBeenCalled();
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(quota.release).toHaveBeenCalledWith(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '11',
      );
    });

    it('emits a VIRUS_DETECTED audit event and an upload:quarantined realtime event', async () => {
      uploads.findById.mockResolvedValue(makeSession({ clientChecksum: null }));
      virusScan.scanStream.mockResolvedValue({
        infected: true,
        viruses: ['Eicar-Test-Signature'],
      });

      await useCase.execute({
        storageObjectId: 'upload-1',
        ownerId: 'owner-1',
        folderId: 'folder-1',
        name: 'report.pdf',
      });

      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          eventType: 'VIRUS_DETECTED',
          outcome: 'FAILURE',
          actorId: 'owner-1',
        }),
      );
      expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
        'owner-1',
        'upload:quarantined',
        { uploadId: 'upload-1', viruses: ['Eicar-Test-Signature'] },
      );
    });

    it('also quarantines an infected new-version upload instead of adding the version', async () => {
      uploads.findById.mockResolvedValue(makeSession({ clientChecksum: null }));
      virusScan.scanStream.mockResolvedValue({
        infected: true,
        viruses: ['Eicar-Test-Signature'],
      });

      await useCase.execute({
        storageObjectId: 'upload-1',
        ownerId: 'owner-1',
        versionOfFileId: 'file-1',
      });

      expect(addFileVersion.execute).not.toHaveBeenCalled();
      expect(uploads.markQuarantined).toHaveBeenCalledWith('upload-1');
    });
  });
});
