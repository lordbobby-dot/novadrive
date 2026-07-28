import {
  buildChildPath,
  isSelfOrDescendant,
  parseAncestorIds,
} from './folder.entity';

describe('parseAncestorIds', () => {
  it('returns an empty array for the root path', () => {
    expect(parseAncestorIds('/')).toEqual([]);
  });

  it('splits a nested path into ordered ancestor ids', () => {
    expect(parseAncestorIds('/a/b/c/')).toEqual(['a', 'b', 'c']);
  });
});

describe('buildChildPath', () => {
  it("appends the parent's id to the parent's path", () => {
    expect(buildChildPath({ path: '/', id: 'root' })).toBe('/root/');
    expect(buildChildPath({ path: '/root/', id: 'child' })).toBe(
      '/root/child/',
    );
  });
});

describe('isSelfOrDescendant', () => {
  const a = { id: 'a', path: '/root/' };
  const aChild = { id: 'b', path: '/root/a/' };
  const aGrandchild = { id: 'c', path: '/root/a/b/' };
  const sibling = { id: 'd', path: '/root/' };
  const unrelated = { id: 'e', path: '/root/x/' };

  it('is true for the folder itself', () => {
    expect(isSelfOrDescendant(a, a)).toBe(true);
  });

  it('is true for a direct child', () => {
    expect(isSelfOrDescendant(a, aChild)).toBe(true);
  });

  it('is true for a grandchild (any depth)', () => {
    expect(isSelfOrDescendant(a, aGrandchild)).toBe(true);
  });

  it('is false for a sibling that merely shares a path prefix', () => {
    // Regression guard: "d" sits at the same path as "a" (same parent) but is not inside "a"'s
    // subtree — a naive `path.startsWith(ancestor.path)` check (without the id segment) would
    // wrongly treat every sibling as a descendant.
    expect(isSelfOrDescendant(a, sibling)).toBe(false);
  });

  it('is false for an unrelated folder', () => {
    expect(isSelfOrDescendant(a, unrelated)).toBe(false);
  });

  it('is false for the ancestor direction (a parent is not its own child)', () => {
    expect(isSelfOrDescendant(aChild, a)).toBe(false);
  });
});
