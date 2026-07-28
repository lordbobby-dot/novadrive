import { Inject, Injectable } from '@nestjs/common';
import { PermissionResolver } from '../domain/permission-resolver.service';
import type { Permission, ResourceTypeName } from '../domain/permission.entity';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from '../domain/permission.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';

export interface PermissionWithSubject {
  permission: Permission;
  subjectEmail: string | null;
  subjectName: string | null;
}

/** Seeing who has access is itself an admin-level action, same threshold as granting/revoking.
 * Batch-resolves every grant's subjectId to a display email/name in one extra query rather than
 * one per collaborator — a Permission row only carries a bare user id otherwise. */
@Injectable()
export class ListPermissionsForResourceUseCase {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  async execute(
    actorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<PermissionWithSubject[]> {
    await this.resolver.requireRole(actorId, resourceType, resourceId, 'ADMIN');
    const grants = await this.permissions.listForResource(
      resourceType,
      resourceId,
    );

    const subjects = await this.users.findByIds(
      grants.map((grant) => grant.subjectId),
    );
    const subjectById = new Map(subjects.map((user) => [user.id, user]));

    return grants.map((permission) => {
      const subject = subjectById.get(permission.subjectId);
      return {
        permission,
        subjectEmail: subject?.email ?? null,
        subjectName: subject?.name ?? null,
      };
    });
  }
}
