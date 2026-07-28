import { Inject, Injectable } from '@nestjs/common';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from '../domain/permission.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import type { SharedWithMePage } from '../domain/shared-with-me.entity';

/** Files/folders directly granted to the caller by someone else — excludes org/workspace-wide
 * access (already surfaced by the Organizations UI) since that's resolved via OrgRoleResolver
 * against OrganizationMember, never through a Permission row. Batch-resolves each row's ownerId
 * to a display name in one extra query, same pattern as ListPermissionsForResourceUseCase. */
@Injectable()
export class ListSharedWithMeUseCase {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(
    subjectId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<SharedWithMePage> {
    const { rows, nextCursor } = await this.permissions.listGrantedToSubject(
      subjectId,
      cursor,
      limit,
    );

    const owners = await this.users.findByIds([
      ...new Set(rows.map((row) => row.ownerId)),
    ]);
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

    return {
      items: rows.map((row) => {
        const owner = ownerById.get(row.ownerId);
        return { ...row, ownerName: owner?.name ?? owner?.email ?? null };
      }),
      nextCursor,
    };
  }
}
