import { ListTrashUseCase } from './list-trash.use-case';
import type { TrashListItem } from '../domain/trash.entity';
import type { TrashRepository } from '../domain/trash.repository';

function makeItem(id: string): TrashListItem {
  return {
    trashId: `trash-${id}`,
    type: 'file',
    id,
    name: `file-${id}`,
    deletedAt: new Date(),
  };
}

describe('ListTrashUseCase', () => {
  let trash: jest.Mocked<TrashRepository>;
  let useCase: ListTrashUseCase;

  beforeEach(() => {
    trash = {
      listRoots: jest.fn(),
      findById: jest.fn(),
      findExpiredRoots: jest.fn(),
      getStorageObjectLocations: jest.fn(),
      deleteStorageObjects: jest.fn(),
    };
    useCase = new ListTrashUseCase(trash);
  });

  it('returns no next cursor when the page is not full (no lookahead row)', async () => {
    trash.listRoots.mockResolvedValue([makeItem('1'), makeItem('2')]);

    const result = await useCase.execute({ ownerId: 'owner-1', limit: 5 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('trims the lookahead row and derives the next cursor from the current offset + limit', async () => {
    trash.listRoots.mockResolvedValue([
      makeItem('1'),
      makeItem('2'),
      makeItem('3'),
    ]);

    const result = await useCase.execute({
      ownerId: 'owner-1',
      cursor: '10',
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(['1', '2']);
    expect(result.nextCursor).toBe('12');
  });

  it('defaults the offset to 0 when no cursor is supplied', async () => {
    trash.listRoots.mockResolvedValue([makeItem('1'), makeItem('2')]);

    const result = await useCase.execute({ ownerId: 'owner-1', limit: 1 });

    expect(result.nextCursor).toBe('1');
  });
});
