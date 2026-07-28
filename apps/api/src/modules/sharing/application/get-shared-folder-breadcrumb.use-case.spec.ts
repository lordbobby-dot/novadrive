import { GetSharedFolderBreadcrumbUseCase } from './get-shared-folder-breadcrumb.use-case';
import { SharedFolderAccessResolver } from '../domain/shared-folder-access-resolver.service';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';

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

describe('GetSharedFolderBreadcrumbUseCase', () => {
  let access: jest.Mocked<SharedFolderAccessResolver>;
  let folders: jest.Mocked<FolderRepository>;
  let useCase: GetSharedFolderBreadcrumbUseCase;

  beforeEach(() => {
    access = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<SharedFolderAccessResolver>;
    folders = {
      findByIds: jest.fn(),
    } as unknown as jest.Mocked<FolderRepository>;
    useCase = new GetSharedFolderBreadcrumbUseCase(access, folders);
  });

  it('returns just the root folder when browsing at the shared root itself', async () => {
    const root = makeFolder();
    access.resolve.mockResolvedValue({
      link: {} as never,
      rootFolder: root,
      targetFolder: root,
    });

    const result = await useCase.execute('tok_abc', undefined, undefined);

    expect(result).toEqual([root]);
    expect(folders.findByIds).not.toHaveBeenCalled();
  });

  it("builds the chain from the shared root down to a descendant, never including drive-root's own ancestors above the shared root", async () => {
    // Real Drive tree: /drive-root/root-folder/mid-folder/ — "drive-root" itself is the user's
    // personal Drive root and must never appear in a public breadcrumb.
    const root = makeFolder({ id: 'root-folder', path: '/drive-root/' });
    const mid = makeFolder({
      id: 'mid-folder',
      name: 'Mid',
      path: '/drive-root/root-folder/',
    });
    const target = makeFolder({
      id: 'target-folder',
      name: 'Target',
      path: '/drive-root/root-folder/mid-folder/',
    });
    access.resolve.mockResolvedValue({
      link: {} as never,
      rootFolder: root,
      targetFolder: target,
    });
    folders.findByIds.mockResolvedValue([mid]);

    const result = await useCase.execute('tok_abc', undefined, 'target-folder');

    expect(folders.findByIds).toHaveBeenCalledWith(
      ['root-folder', 'mid-folder'],
      target.ownerId,
    );
    expect(result.map((f) => f.id)).toEqual([
      'root-folder',
      'mid-folder',
      'target-folder',
    ]);
    expect(result[0]).toBe(root);
    expect(result[2]).toBe(target);
  });
});
