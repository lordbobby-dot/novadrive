import {
  Permission,
  PermissionRoleName,
  ResourceTypeName,
} from './permission.entity';
import { SharedWithMeRow } from './shared-with-me.entity';

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');

export interface CreatePermissionParams {
  subjectId: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  role: PermissionRoleName;
  grantedBy: string;
}

export interface PermissionRepository {
  findExplicit(
    subjectId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Permission | null>;
  /** All of a subject's grants across a batch of resource ids, in one query — used to resolve
   * an entire ancestor chain without one round trip per folder level. */
  findManyForSubject(
    subjectId: string,
    resourceType: ResourceTypeName,
    resourceIds: string[],
  ): Promise<Permission[]>;
  /** Creates or updates the grant for (subjectId, resourceType, resourceId) — re-granting with a
   * different role changes it rather than erroring on the unique constraint. */
  upsert(params: CreatePermissionParams): Promise<Permission>;
  findById(id: string): Promise<Permission | null>;
  delete(id: string): Promise<void>;
  listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Permission[]>;
  /** FILE/FOLDER resources directly granted to subjectId, excluding anything the subject owns
   * (defensive — direct grants to yourself shouldn't exist) and anything currently trashed by its
   * owner. Offset-paginated, most recently granted first — same scheme as Search/Recent/Favorites. */
  listGrantedToSubject(
    subjectId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ rows: SharedWithMeRow[]; nextCursor: string | null }>;
}
