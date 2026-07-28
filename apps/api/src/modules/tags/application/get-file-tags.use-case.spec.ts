import { NotFoundException } from '@nestjs/common';
import { GetFileTagsUseCase } from './get-file-tags.use-case';
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

describe('GetFileTagsUseCase', () => {
  let files: jest.Mocked<FileRepository>;
  let tags: jest.Mocked<TagRepository>;
  let useCase: GetFileTagsUseCase;

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
    useCase = new GetFileTagsUseCase(files, tags);
  });

  it("throws NotFoundException when the file doesn't exist", async () => {
    files.findByIdUnscoped.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tags.getFileTags).not.toHaveBeenCalled();
  });

  it('returns the tags for an existing file', async () => {
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    const result: Tag[] = [
      { id: 'tag-1', ownerId: 'owner-1', name: 'work', createdAt: new Date() },
    ];
    tags.getFileTags.mockResolvedValue(result);

    const actual = await useCase.execute('file-1', 'owner-1');

    expect(tags.getFileTags).toHaveBeenCalledWith('file-1');
    expect(actual).toBe(result);
  });
});
