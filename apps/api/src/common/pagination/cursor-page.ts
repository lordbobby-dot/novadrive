export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface CursorPaginatable {
  id: string;
}

/**
 * Given `limit + 1` rows fetched with `take: limit + 1`, splits off the lookahead row and
 * derives the next cursor from it — the standard "fetch one extra" cursor-pagination trick.
 */
export function buildCursorPage<T extends CursorPaginatable>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}
