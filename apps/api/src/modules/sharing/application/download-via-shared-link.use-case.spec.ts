import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DownloadViaSharedLinkUseCase } from './download-via-shared-link.use-case';
import { hashPassword } from '../infrastructure/password-hash';
import { SharedLinkPasswordRequiredException } from '../domain/shared-link-access.exception';
import type { SharedLink } from '../domain/shared-link.entity';
import type { SharedLinkRepository } from '../domain/shared-link.repository';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { StorageAdapter } from '../../storage/domain/storage-adapter';

function makeLink(overrides: Partial<SharedLink> = {}): SharedLink {
  return {
    id: 'link-1',
    resourceType: 'FILE',
    resourceId: 'file-1',
    token: 'tok_abc',
    ownerId: 'owner-1',
    passwordHash: null,
    expiresAt: null,
    maxDownloads: null,
    downloadCount: 0,
    canView: true,
    canDownload: true,
    canComment: false,
    canEdit: false,
    visibility: 'PRIVATE',
    createdAt: new Date(),
    ...overrides,
  };
}

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
    objectKey: 'uploads/owner-1/abc',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'root-folder',
    name: 'Shared Docs',
    ownerId: 'owner-1',
    parentId: 'drive-root',
    path: '/drive-root/',
    depth: 1,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DownloadViaSharedLinkUseCase', () => {
  let links: jest.Mocked<SharedLinkRepository>;
  let files: jest.Mocked<FileRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let storage: jest.Mocked<StorageAdapter>;
  let useCase: DownloadViaSharedLinkUseCase;

  beforeEach(() => {
    links = {
      create: jest.fn(),
      findById: jest.fn(),
      findByToken: jest.fn(),
      listForResource: jest.fn(),
      delete: jest.fn(),
      incrementDownloadCountIfUnderLimit: jest.fn(),
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
    folders = {
      findById: jest.fn(),
      findByIdUnscoped: jest.fn(),
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
    useCase = new DownloadViaSharedLinkUseCase(links, files, folders, storage);
  });

  it("404s when the token doesn't exist", async () => {
    links.findByToken.mockResolvedValue(null);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when the link has expired', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ expiresAt: new Date('2020-01-01') }),
    );
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires the password when the link is password-protected', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ passwordHash: await hashPassword('secret') }),
    );
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      SharedLinkPasswordRequiredException,
    );
  });

  it('rejects downloading a folder link directly', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ resourceType: 'FOLDER', resourceId: 'folder-1' }),
    );
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when the link disallows downloads', async () => {
    links.findByToken.mockResolvedValue(makeLink({ canDownload: false }));
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(links.incrementDownloadCountIfUnderLimit).not.toHaveBeenCalled();
  });

  it('rejects when downloadCount already meets maxDownloads, without touching the counter', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ maxDownloads: 3, downloadCount: 3 }),
    );
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(links.incrementDownloadCountIfUnderLimit).not.toHaveBeenCalled();
  });

  it('rejects when the atomic increment loses the race at the limit', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ maxDownloads: 3, downloadCount: 2 }),
    );
    links.incrementDownloadCountIfUnderLimit.mockResolvedValue(null);

    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(files.findByIdUnscoped).not.toHaveBeenCalled();
  });

  it('presigns an attachment-disposition download URL and increments the counter on success', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ maxDownloads: 5, downloadCount: 1 }),
    );
    links.incrementDownloadCountIfUnderLimit.mockResolvedValue(
      makeLink({ maxDownloads: 5, downloadCount: 2 }),
    );
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    const expiresAt = new Date('2026-01-01T00:05:00.000Z');
    storage.presignGetObject.mockResolvedValue({
      url: 'https://s3.example/signed',
      expiresAt,
    });

    const result = await useCase.execute('tok_abc');

    expect(storage.presignGetObject).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: 'attachment' }),
    );
    expect(result).toEqual({
      url: 'https://s3.example/signed',
      expiresAt,
      fileName: 'report.pdf',
    });
  });

  describe('FOLDER-type link — downloading a specific file discovered by browsing', () => {
    it('requires fileId', async () => {
      links.findByToken.mockResolvedValue(
        makeLink({ resourceType: 'FOLDER', resourceId: 'root-folder' }),
      );
      await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(links.incrementDownloadCountIfUnderLimit).not.toHaveBeenCalled();
    });

    it("404s (not an error revealing why) when fileId doesn't lie inside the shared subtree, without ever incrementing the download counter", async () => {
      links.findByToken.mockResolvedValue(
        makeLink({ resourceType: 'FOLDER', resourceId: 'root-folder' }),
      );
      const outsideFile = makeFile({ id: 'file-9', folderId: 'other-folder' });
      files.findByIdUnscoped.mockResolvedValue(outsideFile);
      folders.findByIdUnscoped.mockImplementation((id) => {
        if (id === 'root-folder')
          return Promise.resolve(makeFolder({ path: '/drive-root/' }));
        if (id === 'other-folder')
          return Promise.resolve(
            makeFolder({
              id: 'other-folder',
              path: '/drive-root/some-other-folder/',
            }),
          );
        return Promise.resolve(null);
      });

      await expect(
        useCase.execute('tok_abc', undefined, 'file-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(links.incrementDownloadCountIfUnderLimit).not.toHaveBeenCalled();
    });

    it('presigns a download for a file inside the shared subtree and increments the counter', async () => {
      links.findByToken.mockResolvedValue(
        makeLink({ resourceType: 'FOLDER', resourceId: 'root-folder' }),
      );
      const nestedFile = makeFile({ id: 'file-9', folderId: 'child-folder' });
      files.findByIdUnscoped.mockResolvedValue(nestedFile);
      folders.findByIdUnscoped.mockImplementation((id) => {
        if (id === 'root-folder')
          return Promise.resolve(makeFolder({ path: '/drive-root/' }));
        if (id === 'child-folder')
          return Promise.resolve(
            makeFolder({
              id: 'child-folder',
              path: '/drive-root/root-folder/',
            }),
          );
        return Promise.resolve(null);
      });
      links.incrementDownloadCountIfUnderLimit.mockResolvedValue(makeLink());
      const expiresAt = new Date('2026-01-01T00:05:00.000Z');
      storage.presignGetObject.mockResolvedValue({
        url: 'https://s3.example/signed',
        expiresAt,
      });

      const result = await useCase.execute('tok_abc', undefined, 'file-9');

      expect(links.incrementDownloadCountIfUnderLimit).toHaveBeenCalledWith(
        'link-1',
      );
      expect(result).toEqual({
        url: 'https://s3.example/signed',
        expiresAt,
        fileName: nestedFile.name,
      });
    });
  });
});
