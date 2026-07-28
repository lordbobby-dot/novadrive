import { NotFoundException } from '@nestjs/common';
import { GetBreadcrumbUseCase } from './get-breadcrumb.use-case';
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

describe('GetBreadcrumbUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: GetBreadcrumbUseCase;

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
    useCase = new GetBreadcrumbUseCase(folders);
  });

  it("throws NotFoundException when the folder doesn't exist (or isn't owned by the caller)", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns just the folder itself for the root', async () => {
    const root = makeFolder({ id: 'root', path: '/' });
    folders.findByIdUnscoped.mockResolvedValue(root);

    const chain = await useCase.execute('root', 'owner-1');

    expect(chain).toEqual([root]);
    expect(folders.findByIds).not.toHaveBeenCalled();
  });

  it('orders ancestors from root to the target folder, inclusive', async () => {
    const target = makeFolder({
      id: 'grandchild',
      name: '2026',
      path: '/root/child/',
      depth: 2,
    });
    folders.findByIdUnscoped.mockResolvedValue(target);
    // Deliberately returned out of order to prove the use case re-orders by path.
    folders.findByIds.mockResolvedValue([
      makeFolder({ id: 'child', name: 'Photos', path: '/root/', depth: 1 }),
      makeFolder({ id: 'root', name: 'My Drive', path: '/', depth: 0 }),
    ]);

    const chain = await useCase.execute('grandchild', 'owner-1');

    expect(chain.map((f) => f.id)).toEqual(['root', 'child', 'grandchild']);
  });
});
