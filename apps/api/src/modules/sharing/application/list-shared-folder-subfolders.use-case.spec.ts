import { ListSharedFolderSubfoldersUseCase } from './list-shared-folder-subfolders.use-case';
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

describe('ListSharedFolderSubfoldersUseCase', () => {
  let access: jest.Mocked<SharedFolderAccessResolver>;
  let folders: jest.Mocked<FolderRepository>;
  let useCase: ListSharedFolderSubfoldersUseCase;

  beforeEach(() => {
    access = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<SharedFolderAccessResolver>;
    folders = {
      findChildren: jest.fn(),
    } as unknown as jest.Mocked<FolderRepository>;
    useCase = new ListSharedFolderSubfoldersUseCase(access, folders);
  });

  it("resolves link access first, then lists the target folder's children scoped by its actual owner", async () => {
    const target = makeFolder({ id: 'target-1', ownerId: 'owner-42' });
    access.resolve.mockResolvedValue({
      link: {} as never,
      rootFolder: target,
      targetFolder: target,
    });
    const child = makeFolder({ id: 'child-1' });
    folders.findChildren.mockResolvedValue([child]);

    const result = await useCase.execute({
      token: 'tok_abc',
      password: 'secret',
      folderId: 'target-1',
      limit: 20,
    });

    expect(access.resolve).toHaveBeenCalledWith(
      'tok_abc',
      'secret',
      'target-1',
    );
    expect(folders.findChildren).toHaveBeenCalledWith({
      ownerId: 'owner-42',
      parentId: 'target-1',
      cursor: undefined,
      limit: 20,
    });
    expect(result.items).toEqual([child]);
  });
});
