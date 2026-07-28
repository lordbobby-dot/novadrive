import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { CopyFileUseCase } from './copy-file.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';
import type { QuotaService } from '../../quota/domain/quota.service';

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
    id: 'folder-2',
    name: 'Target',
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

describe('CopyFileUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let events: jest.Mocked<EventEmitter2>;
  let quota: jest.Mocked<QuotaService>;
  let useCase: CopyFileUseCase;

  beforeEach(() => {
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
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    quota = {
      reserve: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<QuotaService>;
    useCase = new CopyFileUseCase(files, folders, storage, events, quota);
  });

  it("throws NotFoundException when the source file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        id: 'missing',
        ownerId: 'owner-1',
        targetFolderId: 'folder-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when the target folder doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        id: 'file-1',
        ownerId: 'owner-1',
        targetFolderId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.copyObject).not.toHaveBeenCalled();
  });

  it('copies the S3 object under a fresh key, creates a new independent StorageObject, and defaults the name to the source name', async () => {
    const source = makeFile();
    files.findByIdUnscoped.mockResolvedValue(source);
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    storage.copyObject.mockResolvedValue({ eTag: 'new-etag' });
    const copy = makeFile({ id: 'file-2', folderId: 'folder-2' });
    files.copyToNewStorageObject.mockResolvedValue(copy);

    const result = await useCase.execute({
      id: 'file-1',
      ownerId: 'owner-1',
      targetFolderId: 'folder-2',
    });

    expect(storage.copyObject).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBucket: source.bucket,
        sourceObjectKey: source.objectKey,
        destinationBucket: source.bucket,
      }),
    );
    const copyCall = storage.copyObject.mock.calls[0][0];
    expect(copyCall.destinationObjectKey).not.toBe(source.objectKey);
    expect(copyCall.destinationObjectKey.startsWith('uploads/owner-1/')).toBe(
      true,
    );

    expect(files.copyToNewStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        folderId: 'folder-2',
        name: source.name,
        eTag: 'new-etag',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'COPY',
        targetType: 'FILE',
        targetId: 'file-2',
        metadata: { name: source.name, sourceFileId: 'file-1' },
      }),
    );
    expect(result).toBe(copy);
  });

  it('uses an explicitly-provided name instead of the source name', async () => {
    const source = makeFile();
    files.findByIdUnscoped.mockResolvedValue(source);
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    storage.copyObject.mockResolvedValue({ eTag: 'new-etag' });
    files.copyToNewStorageObject.mockResolvedValue(makeFile({ id: 'file-2' }));

    await useCase.execute({
      id: 'file-1',
      ownerId: 'owner-1',
      targetFolderId: 'folder-2',
      name: 'renamed-copy.pdf',
    });

    expect(files.copyToNewStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'renamed-copy.pdf' }),
    );
  });

  it('exposes copy() directly for CopyFolderUseCase to reuse against an already-verified target folder', async () => {
    const source = makeFile();
    const targetFolder = makeFolder({ id: 'folder-9' });
    storage.copyObject.mockResolvedValue({ eTag: 'etag-2' });
    const copy = makeFile({ id: 'file-3' });
    files.copyToNewStorageObject.mockResolvedValue(copy);

    const result = await useCase.copy(
      source,
      'owner-1',
      targetFolder,
      'inner.pdf',
    );

    expect(folders.findByIdUnscoped).not.toHaveBeenCalled();
    expect(files.copyToNewStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder-9', name: 'inner.pdf' }),
    );
    expect(result).toBe(copy);
  });

  it("reserves quota against the target folder's subject before copying, stamping the new StorageObject with it", async () => {
    const source = makeFile({ size: '2048' });
    files.findByIdUnscoped.mockResolvedValue(source);
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ organizationId: 'org-1' }),
    );
    storage.copyObject.mockResolvedValue({ eTag: 'new-etag' });
    files.copyToNewStorageObject.mockResolvedValue(makeFile({ id: 'file-2' }));

    await useCase.execute({
      id: 'file-1',
      ownerId: 'owner-1',
      targetFolderId: 'folder-2',
    });

    expect(quota.reserve).toHaveBeenCalledWith(
      { subjectType: 'ORGANIZATION', subjectId: 'org-1' },
      '2048',
    );
    expect(quota.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      storage.copyObject.mock.invocationCallOrder[0],
    );
    expect(files.copyToNewStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({
        quotaSubjectType: 'ORGANIZATION',
        quotaSubjectId: 'org-1',
      }),
    );
  });

  it('propagates QuotaExceededException before ever calling S3 copyObject', async () => {
    const quotaError = new Error('quota exceeded');
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    quota.reserve.mockRejectedValue(quotaError);

    await expect(
      useCase.execute({
        id: 'file-1',
        ownerId: 'owner-1',
        targetFolderId: 'folder-2',
      }),
    ).rejects.toBe(quotaError);
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(files.copyToNewStorageObject).not.toHaveBeenCalled();
  });
});
