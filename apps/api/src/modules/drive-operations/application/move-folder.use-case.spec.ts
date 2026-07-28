import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MoveFolderUseCase } from './move-folder.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Documents',
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

describe('MoveFolderUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let useCase: MoveFolderUseCase;

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
    useCase = new MoveFolderUseCase(folders, {
      emit: jest.fn(),
    } as unknown as import('@nestjs/event-emitter').EventEmitter2);
  });

  it("throws NotFoundException when the folder doesn't exist", async () => {
    folders.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        id: 'missing',
        actorId: 'owner-1',
        targetParentId: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to move the root folder', async () => {
    folders.findByIdUnscoped.mockResolvedValue(
      makeFolder({ id: 'root', parentId: null }),
    );
    await expect(
      useCase.execute({ id: 'root', actorId: 'owner-1', targetParentId: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.move).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the target parent doesn't exist", async () => {
    folders.findByIdUnscoped.mockImplementation((id) =>
      Promise.resolve(id === 'folder-1' ? makeFolder() : null),
    );
    await expect(
      useCase.execute({
        id: 'folder-1',
        actorId: 'owner-1',
        targetParentId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects moving a folder into itself', async () => {
    const folder = makeFolder({ id: 'folder-1', path: '/root/' });
    folders.findByIdUnscoped.mockImplementation((id) =>
      Promise.resolve(id === 'folder-1' ? folder : null),
    );
    await expect(
      useCase.execute({
        id: 'folder-1',
        actorId: 'owner-1',
        targetParentId: 'folder-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.move).not.toHaveBeenCalled();
  });

  it('rejects moving a folder into its own descendant', async () => {
    const folder = makeFolder({ id: 'folder-1', path: '/root/' });
    // "child" is inside folder-1's subtree: its path is folder-1's own child-path.
    const descendant = makeFolder({ id: 'child', path: '/root/folder-1/' });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(folder);
      if (id === 'child') return Promise.resolve(descendant);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        id: 'folder-1',
        actorId: 'owner-1',
        targetParentId: 'child',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.move).not.toHaveBeenCalled();
  });

  it('is a no-op (returns the folder unchanged) when the target is already the current parent', async () => {
    const folder = makeFolder({
      id: 'folder-1',
      parentId: 'root',
      path: '/root/',
    });
    const targetParent = makeFolder({ id: 'root', path: '/', depth: 0 });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(folder);
      if (id === 'root') return Promise.resolve(targetParent);
      return Promise.resolve(null);
    });

    const result = await useCase.execute({
      id: 'folder-1',
      actorId: 'owner-1',
      targetParentId: 'root',
    });

    expect(result).toBe(folder);
    expect(folders.move).not.toHaveBeenCalled();
  });

  it('moves a folder to a valid new parent', async () => {
    const folder = makeFolder({
      id: 'folder-1',
      parentId: 'root',
      path: '/root/',
    });
    const newParent = makeFolder({
      id: 'other',
      path: '/root/other-parent/',
      depth: 2,
    });
    const moved = makeFolder({ id: 'folder-1', parentId: 'other' });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(folder);
      if (id === 'other') return Promise.resolve(newParent);
      return Promise.resolve(null);
    });
    folders.move.mockResolvedValue(moved);

    const result = await useCase.execute({
      id: 'folder-1',
      actorId: 'owner-1',
      targetParentId: 'other',
    });

    expect(folders.move).toHaveBeenCalledWith({
      id: 'folder-1',
      ownerId: 'owner-1',
      newParentId: 'other',
      newPath: '/root/other-parent/other/',
      newDepth: 3,
    });
    expect(result).toBe(moved);
  });

  it('rejects moving a personal folder into an org workspace', async () => {
    const folder = makeFolder({ id: 'folder-1', parentId: 'root' });
    const wsRoot = makeFolder({
      id: 'ws-root',
      parentId: null,
      path: '/',
      depth: 0,
      organizationId: 'org-1',
      workspaceId: 'ws-1',
    });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(folder);
      if (id === 'ws-root') return Promise.resolve(wsRoot);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        id: 'folder-1',
        actorId: 'owner-1',
        targetParentId: 'ws-root',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.move).not.toHaveBeenCalled();
  });

  it('rejects moving a folder between two different workspaces', async () => {
    const folder = makeFolder({
      id: 'folder-1',
      parentId: 'ws1-root',
      organizationId: 'org-1',
      workspaceId: 'ws-1',
    });
    const otherWsRoot = makeFolder({
      id: 'ws2-root',
      parentId: null,
      path: '/',
      depth: 0,
      organizationId: 'org-1',
      workspaceId: 'ws-2',
    });
    folders.findByIdUnscoped.mockImplementation((id) => {
      if (id === 'folder-1') return Promise.resolve(folder);
      if (id === 'ws2-root') return Promise.resolve(otherWsRoot);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        id: 'folder-1',
        actorId: 'owner-1',
        targetParentId: 'ws2-root',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(folders.move).not.toHaveBeenCalled();
  });
});
