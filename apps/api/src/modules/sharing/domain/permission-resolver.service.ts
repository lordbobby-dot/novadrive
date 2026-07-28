import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { parseAncestorIds } from '../../folders/domain/folder.entity';
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  PermissionRoleName,
  ResourceTypeName,
  roleMeetsMinimum,
} from './permission.entity';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from './permission.repository';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';

/**
 * The single source of truth for "can actor X do action Y on resource Z" — every guard and
 * sharing-aware use case in the app calls this instead of querying the Permission table
 * directly. See docs/permissions.md for the full inheritance algorithm and RBAC matrix.
 *
 * Resolution order:
 *   1. The resource owner is always an implicit OWNER — no Permission row needed.
 *   2. An explicit grant directly on the resource always wins over anything inherited.
 *   3. Otherwise, walk up the containing folder's ancestor chain nearest-first; the first
 *      ancestor with an explicit grant wins (a grant on a closer ancestor overrides one further
 *      up, matching "override wins" rather than "most permissive wins").
 *   4. If the resource (or its containing folder) belongs to an org workspace, fall back to the
 *      actor's org role (see OrgRoleResolver) — this is the extension Milestone 10 adds; every
 *      step above is unchanged from Milestone 7, so personal-Drive resolution has zero
 *      regression.
 *   5. No grant anywhere → no access (`null`).
 */
@Injectable()
export class PermissionResolver {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async resolveRole(
    actorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<PermissionRoleName | null> {
    if (resourceType === 'FOLDER') {
      const folder = await this.folders.findByIdUnscoped(resourceId);
      if (!folder) return null;
      if (folder.ownerId === actorId) return 'OWNER';
      const chainRole = await this.resolveFolderChain(actorId, folder);
      if (chainRole) return chainRole;
      if (folder.organizationId) {
        return this.orgRoles.resolveRole(actorId, folder.organizationId);
      }
      return null;
    }

    const file = await this.files.findByIdUnscoped(resourceId);
    if (!file) return null;
    if (file.ownerId === actorId) return 'OWNER';

    const explicit = await this.permissions.findExplicit(
      actorId,
      'FILE',
      file.id,
    );
    if (explicit) return explicit.role;

    const folder = await this.folders.findByIdUnscoped(file.folderId);
    if (!folder) return null;
    const chainRole = await this.resolveFolderChain(actorId, folder);
    if (chainRole) return chainRole;
    if (folder.organizationId) {
      return this.orgRoles.resolveRole(actorId, folder.organizationId);
    }
    return null;
  }

  async requireRole(
    actorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
    minimumRole: PermissionRoleName,
  ): Promise<PermissionRoleName> {
    const role = await this.resolveRole(actorId, resourceType, resourceId);
    if (!role || !roleMeetsMinimum(role, minimumRole)) {
      throw new ForbiddenException(
        `Insufficient permission on ${resourceType.toLowerCase()} ${resourceId}`,
      );
    }
    return role;
  }

  /** `folder` itself first (an explicit grant directly on it), then its ancestors nearest-first —
   * one batched query for the whole chain rather than one round trip per level. */
  private async resolveFolderChain(
    actorId: string,
    folder: Folder,
  ): Promise<PermissionRoleName | null> {
    const nearestFirst = [
      folder.id,
      ...parseAncestorIds(folder.path).reverse(),
    ];
    const grants = await this.permissions.findManyForSubject(
      actorId,
      'FOLDER',
      nearestFirst,
    );
    const roleByResourceId = new Map(
      grants.map((grant) => [grant.resourceId, grant.role]),
    );
    for (const id of nearestFirst) {
      const role = roleByResourceId.get(id);
      if (role) return role;
    }
    return null;
  }
}
