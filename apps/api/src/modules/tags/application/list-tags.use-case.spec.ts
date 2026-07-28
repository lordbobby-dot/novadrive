import { ListTagsUseCase } from './list-tags.use-case';
import type { Tag } from '../domain/tag.entity';
import type { TagRepository } from '../domain/tag.repository';

describe('ListTagsUseCase', () => {
  let tags: jest.Mocked<TagRepository>;
  let useCase: ListTagsUseCase;

  beforeEach(() => {
    tags = {
      findByOwner: jest.fn(),
      findOrCreateMany: jest.fn(),
      getFileTags: jest.fn(),
      getFolderTags: jest.fn(),
      setFileTags: jest.fn(),
      setFolderTags: jest.fn(),
    };
    useCase = new ListTagsUseCase(tags);
  });

  it("delegates to the repository's findByOwner", async () => {
    const result: Tag[] = [
      { id: 'tag-1', ownerId: 'owner-1', name: 'work', createdAt: new Date() },
    ];
    tags.findByOwner.mockResolvedValue(result);

    const actual = await useCase.execute('owner-1');

    expect(tags.findByOwner).toHaveBeenCalledWith('owner-1');
    expect(actual).toBe(result);
  });
});
