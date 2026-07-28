export interface Folder {
  id: string;
  name: string;
  ownerId: string;
  parentId: string | null;
  path: string;
  depth: number;
  /** Both null for a personal-Drive folder; both set (inherited from the parent at creation
   * time) for a folder inside an org workspace. See schema.prisma's Folder model comment. */
  organizationId: string | null;
  workspaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Splits a materialized path like "/a/b/" into its ordered ancestor ids ["a", "b"]. */
export function parseAncestorIds(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Builds the child's materialized path given its parent's path and id. */
export function buildChildPath(parent: Pick<Folder, 'path' | 'id'>): string {
  return `${parent.path}${parent.id}/`;
}

/** True if `candidate` is `ancestor` itself, or lies anywhere in `ancestor`'s subtree — the
 * check that blocks moving/copying a folder into its own descendant (which would either orphan
 * the subtree or create a path cycle, depending on which side "wins"). */
export function isSelfOrDescendant(
  ancestor: Pick<Folder, 'id' | 'path'>,
  candidate: Pick<Folder, 'id' | 'path'>,
): boolean {
  if (candidate.id === ancestor.id) return true;
  return candidate.path.startsWith(buildChildPath(ancestor));
}
