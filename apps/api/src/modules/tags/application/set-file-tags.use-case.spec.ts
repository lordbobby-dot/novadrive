import { NotFoundException } from '@nestjs/common';
import { SetFileTagsUseCase } from './set-file-tags.use-case';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { Tag } from '../domain/tag.entity';
import type { TagRepository } from '../domain/tag.repository';

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
    objectKey: 'uploads/owner-1/existing',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SetFileTagsUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let tags: jest.Mocked<TagRepository>;
  let useCase: SetFileTagsUseCase;

  beforeEach(() => {
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
    tags = {
      findByOwner: jest.fn(),
      findOrCreateMany: jest.fn(),
      getFileTags: jest.fn(),
      getFolderTags: jest.fn(),
      setFileTags: jest.fn(),
      setFolderTags: jest.fn(),
    };
    useCase = new SetFileTagsUseCase(files, tags);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(
      useCase.execute({
        fileId: 'missing',
        ownerId: 'owner-1',
        names: ['work'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tags.findOrCreateMany).not.toHaveBeenCalled();
  });

  it('resolves tag names (find-or-create) and replaces the file tag set with their ids', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    const resolved: Tag[] = [
      { id: 'tag-1', ownerId: 'owner-1', name: 'work', createdAt: new Date() },
      {
        id: 'tag-2',
        ownerId: 'owner-1',
        name: 'urgent',
        createdAt: new Date(),
      },
    ];
    tags.findOrCreateMany.mockResolvedValue(resolved);

    const result = await useCase.execute({
      fileId: 'file-1',
      ownerId: 'owner-1',
      names: ['work', 'urgent'],
    });

    expect(tags.findOrCreateMany).toHaveBeenCalledWith('owner-1', [
      'work',
      'urgent',
    ]);
    expect(tags.setFileTags).toHaveBeenCalledWith('file-1', 'owner-1', [
      'tag-1',
      'tag-2',
    ]);
    expect(result).toBe(resolved);
  });
});
