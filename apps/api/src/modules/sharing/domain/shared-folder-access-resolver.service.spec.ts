import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SharedFolderAccessResolver } from './shared-folder-access-resolver.service';
import { hashPassword } from '../infrastructure/password-hash';
import { SharedLinkPasswordRequiredException } from './shared-link-access.exception';
import type { SharedLink } from './shared-link.entity';
import type { SharedLinkRepository } from './shared-link.repository';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';

function makeLink(overrides: Partial<SharedLink> = {}): SharedLink {
  return {
    id: 'link-1',
    resourceType: 'FOLDER',
    resourceId: 'root-folder',
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

describe('SharedFolderAccessResolver', () => {
  let links: jest.Mocked<SharedLinkRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let resolver: SharedFolderAccessResolver;

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
    resolver = new SharedFolderAccessResolver(links, folders);
  });

  it('404s when the token is unknown', async () => {
    links.findByToken.mockResolvedValue(null);
    await expect(
      resolver.resolve('tok_missing', undefined, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the link has expired', async () => {
    links.findByToken.mockResolvedValue(
      makeLink({ expiresAt: new Date('2000-01-01') }),
    );
    await expect(
      resolver.resolve('tok_abc', undefined, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a FILE-type link with BadRequestException', async () => {
    links.findByToken.mockResolvedValue(makeLink({ resourceType: 'FILE' }));
    await expect(
      resolver.resolve('tok_abc', undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the password when the link is password-protected', async () => {
    const passwordHash = await hashPassword('secret');
    links.findByToken.mockResolvedValue(makeLink({ passwordHash }));
    await expect(
      resolver.resolve('tok_abc', undefined, undefined),
    ).rejects.toBeInstanceOf(SharedLinkPasswordRequiredException);
    await expect(
      resolver.resolve('tok_abc', 'wrong', undefined),
    ).rejects.toBeInstanceOf(SharedLinkPasswordRequiredException);
  });

  it('rejects a link with canView false', async () => {
    links.findByToken.mockResolvedValue(makeLink({ canView: false }));
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    await expect(
      resolver.resolve('tok_abc', undefined, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("404s when the link's own root folder no longer exists", async () => {
    links.findByToken.mockResolvedValue(makeLink());
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      resolver.resolve('tok_abc', undefined, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves the root folder itself when no folderId is given', async () => {
    const root = makeFolder();
    links.findByToken.mockResolvedValue(makeLink());
    folders.findByIdUnscoped.mockResolvedValue(root);

    const result = await resolver.resolve('tok_abc', undefined, undefined);

    expect(result.rootFolder).toBe(root);
    expect(result.targetFolder).toBe(root);
    // Only one lookup — the root folder is reused as the target, not re-fetched.
    expect(folders.findByIdUnscoped).toHaveBeenCalledTimes(1);
  });

  it('resolves a descendant folderId that lies inside the shared subtree', async () => {
    const root = makeFolder({ id: 'root-folder', path: '/drive-root/' });
    const child = makeFolder({
      id: 'child-folder',
      path: '/drive-root/root-folder/',
    });
    links.findByToken.mockResolvedValue(
      makeLink({ resourceId: 'root-folder' }),
    );
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'root-folder') return Promise.resolve(root);
      if (id === 'child-folder') return Promise.resolve(child);
      return Promise.resolve(null);
    });

    const result = await resolver.resolve('tok_abc', undefined, 'child-folder');

    expect(result.rootFolder).toBe(root);
    expect(result.targetFolder).toBe(child);
  });

  it('404s when the requested folderId is unrelated to the shared subtree', async () => {
    const root = makeFolder({ id: 'root-folder', path: '/drive-root/' });
    const unrelated = makeFolder({
      id: 'unrelated-folder',
      path: '/drive-root/some-other-folder/',
    });
    links.findByToken.mockResolvedValue(
      makeLink({ resourceId: 'root-folder' }),
    );
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'root-folder') return Promise.resolve(root);
      if (id === 'unrelated-folder') return Promise.resolve(unrelated);
      return Promise.resolve(null);
    });

    await expect(
      resolver.resolve('tok_abc', undefined, 'unrelated-folder'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the requested folderId does not exist at all', async () => {
    links.findByToken.mockResolvedValue(makeLink());
    folders.findByIdUnscoped.mockImplementation((id) =>
      Promise.resolve(id === 'root-folder' ? makeFolder() : null),
    );

    await expect(
      resolver.resolve('tok_abc', undefined, 'ghost-folder'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
