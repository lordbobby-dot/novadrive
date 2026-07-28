import { NotFoundException } from '@nestjs/common';
import { GetFolderTagsUseCase } from './get-folder-tags.use-case';
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

describe('GetFolderTagsUseCase', () => {
  let folders: jest.Mocked<FolderRepository>;
  let tags: jest.Mocked<TagRepository>;
  let useCase: GetFolderTagsUseCase;

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
    useCase = new GetFolderTagsUseCase(folders, tags);
  });

  it("throws NotFoundException when the folder doesn't exist (or isn't owned by the caller)", async () => {
    folders.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tags.getFolderTags).not.toHaveBeenCalled();
  });

  it('returns the tags for an owned folder', async () => {
    folders.findById.mockResolvedValue(makeFolder());
    const result: Tag[] = [
      { id: 'tag-1', ownerId: 'owner-1', name: 'work', createdAt: new Date() },
    ];
    tags.getFolderTags.mockResolvedValue(result);

    const actual = await useCase.execute('folder-1', 'owner-1');

    expect(folders.findById).toHaveBeenCalledWith('folder-1', 'owner-1');
    expect(tags.getFolderTags).toHaveBeenCalledWith('folder-1');
    expect(actual).toBe(result);
  });
});
