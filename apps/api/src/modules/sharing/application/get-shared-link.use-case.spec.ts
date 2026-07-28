import { NotFoundException } from '@nestjs/common';
import { GetSharedLinkUseCase } from './get-shared-link.use-case';
import { hashPassword } from '../infrastructure/password-hash';
import { SharedLinkPasswordRequiredException } from '../domain/shared-link-access.exception';
import type { SharedLink } from '../domain/shared-link.entity';
import type { SharedLinkRepository } from '../domain/shared-link.repository';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';

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
    id: 'folder-1',
    name: 'Docs',
    ownerId: 'owner-1',
    parentId: 'root',
    path: '/root/',
    depth: 1,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GetSharedLinkUseCase', () => {
  let links: jest.Mocked<SharedLinkRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let useCase: GetSharedLinkUseCase;

  beforeEach(() => {
    links = {
      create: jest.fn(),
      findById: jest.fn(),
      findByToken: jest.fn(),
      listForResource: jest.fn(),
      delete: jest.fn(),
      incrementDownloadCountIfUnderLimit: jest.fn(),
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
    useCase = new GetSharedLinkUseCase(links, folders, files);
  });

  it("404s (not a permission error) when the token doesn't exist — anti-enumeration", async () => {
    links.findByToken.mockResolvedValue(null);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s identically for an expired link (indistinguishable from a nonexistent one)', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ expiresAt: new Date('2020-01-01') }),
    );
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws SharedLinkPasswordRequiredException (not 404) when no password is given', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ passwordHash: await hashPassword('secret') }),
    );
    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      SharedLinkPasswordRequiredException,
    );
  });

  it('throws SharedLinkPasswordRequiredException when the wrong password is given', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ passwordHash: await hashPassword('secret') }),
    );
    await expect(
      useCase.execute('tok_abc', 'wrong-password'),
    ).rejects.toBeInstanceOf(SharedLinkPasswordRequiredException);
  });

  it('succeeds with the correct password and resolves the file name/type/size', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ passwordHash: await hashPassword('secret') }),
    );
    files.findByIdUnscoped.mockResolvedValue(makeFile());

    const result = await useCase.execute('tok_abc', 'secret');

    expect(result.resourceName).toBe('report.pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.size).toBe('1024');
  });

  it('resolves a folder link to the folder name with null contentType/size', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ resourceType: 'FOLDER', resourceId: 'folder-1' }),
    );
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());

    const result = await useCase.execute('tok_abc');

    expect(result.resourceName).toBe('Docs');
    expect(result.contentType).toBeNull();
    expect(result.size).toBeNull();
  });

  it('404s when the underlying resource has since been deleted', async () => {
    links.findByToken.mockResolvedValue(makeLink());
    files.findByIdUnscoped.mockResolvedValue(null);

    await expect(useCase.execute('tok_abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
