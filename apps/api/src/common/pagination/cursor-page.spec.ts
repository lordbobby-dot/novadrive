import { buildCursorPage } from './cursor-page';

describe('buildCursorPage', () => {
  it("returns all rows and a null cursor when there's no more data", () => {
    const page = buildCursorPage([{ id: 'a' }, { id: 'b' }], 5);
    expect(page).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: null,
    });
  });

  it('trims the lookahead row and derives nextCursor from the last kept item', () => {
    const page = buildCursorPage([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2);
    expect(page.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(page.nextCursor).toBe('b');
  });

  it('handles an empty result set', () => {
    expect(buildCursorPage([], 20)).toEqual({ items: [], nextCursor: null });
  });
});
