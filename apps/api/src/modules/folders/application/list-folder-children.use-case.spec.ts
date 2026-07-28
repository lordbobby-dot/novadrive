import { NotFoundException } from '@nestjs/common';
import { ListFolderChildrenUseCase } from './list-folder-children.use-case';
import type { Folder } from '../domain/folder.entity';
import type { FolderRepository } from '../domain/folder.repository';

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

describe('ListFolderChildrenUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: ListFolderChildrenUseCase;

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
    useCase = new ListFolderChildrenUseCase(folders);
  });

  it("throws NotFoundException when the parent doesn't exist (or isn't owned by the caller)", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({ ownerId: 'owner-1', parentId: 'missing', limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives nextCursor from the lookahead row when there are more results', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    folders.findChildren.mockResolvedValue([
      makeFolder({ id: 'a' }),
      makeFolder({ id: 'b' }),
      makeFolder({ id: 'c' }),
    ]);

    const page = await useCase.execute({
      ownerId: 'owner-1',
      parentId: 'folder-1',
      limit: 2,
    });

    expect(page.items.map((f) => f.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('b');
  });

  it('returns a null cursor on the last page', async () => {
    folders.findByIdUnscoped.mockResolvedValue(makeFolder());
    folders.findChildren.mockResolvedValue([makeFolder({ id: 'a' })]);

    const page = await useCase.execute({
      ownerId: 'owner-1',
      parentId: 'folder-1',
      limit: 20,
    });

    expect(page.nextCursor).toBeNull();
  });
});
