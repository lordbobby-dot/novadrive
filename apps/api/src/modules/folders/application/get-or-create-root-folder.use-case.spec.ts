import { GetOrCreateRootFolderUseCase } from './get-or-create-root-folder.use-case';
import type { Folder } from '../domain/folder.entity';
import type { FolderRepository } from '../domain/folder.repository';

function makeRoot(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'root-1',
    name: 'My Drive',
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

describe('GetOrCreateRootFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: GetOrCreateRootFolderUseCase;

  beforeEach(() => {
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
    useCase = new GetOrCreateRootFolderUseCase(folders);
  });

  it('returns the existing root without creating one', async () => {
    const root = makeRoot();
    folders.findRoot.mockResolvedValue(root);

    const result = await useCase.execute('owner-1');

    expect(result).toBe(root);
    expect(folders.createRoot).not.toHaveBeenCalled();
  });

  it('lazily creates a root folder when the user has none yet', async () => {
    folders.findRoot.mockResolvedValue(null);
    const created = makeRoot();
    folders.createRoot.mockResolvedValue(created);

    const result = await useCase.execute('owner-1');

    expect(folders.createRoot).toHaveBeenCalledWith('owner-1');
    expect(result).toBe(created);
  });
});
