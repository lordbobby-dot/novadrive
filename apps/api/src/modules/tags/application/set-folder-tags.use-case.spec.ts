import { NotFoundException } from '@nestjs/common';
import { SetFolderTagsUseCase } from './set-folder-tags.use-case';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { Tag } from '../domain/tag.entity';
import type { TagRepository } from '../domain/tag.repository';

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

describe('SetFolderTagsUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let tags: jest.Mocked<TagRepository>;
  let useCase: SetFolderTagsUseCase;

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
    tags = {
      findByOwner: jest.fn(),
      findOrCreateMany: jest.fn(),
      getFileTags: jest.fn(),
      getFolderTags: jest.fn(),
      setFileTags: jest.fn(),
      setFolderTags: jest.fn(),
    };
    useCase = new SetFolderTagsUseCase(folders, tags);
  });

  it("throws NotFoundException when the folder doesn't exist (or isn't owned by the caller)", async () => {
    folders.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        folderId: 'missing',
        ownerId: 'owner-1',
        names: ['work'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tags.findOrCreateMany).not.toHaveBeenCalled();
  });

  it('resolves tag names (find-or-create) and replaces the folder tag set with their ids', async () => {
    folders.findById.mockResolvedValue(makeFolder());
    const resolved: Tag[] = [
      { id: 'tag-1', ownerId: 'owner-1', name: 'work', createdAt: new Date() },
    ];
    tags.findOrCreateMany.mockResolvedValue(resolved);

    const result = await useCase.execute({
      folderId: 'folder-1',
      ownerId: 'owner-1',
      names: ['work'],
    });

    expect(folders.findById).toHaveBeenCalledWith('folder-1', 'owner-1');
    expect(tags.findOrCreateMany).toHaveBeenCalledWith('owner-1', ['work']);
    expect(tags.setFolderTags).toHaveBeenCalledWith('folder-1', 'owner-1', [
      'tag-1',
    ]);
    expect(result).toBe(resolved);
  });
});
