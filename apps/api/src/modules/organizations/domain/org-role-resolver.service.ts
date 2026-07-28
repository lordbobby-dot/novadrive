import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  roleMeetsMinimum,
  type PermissionRoleName,
} from '../../sharing/domain/permission.entity';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './organization.repository';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from './organization-member.repository';

/**
 * The org-level analog of PermissionResolver (sharing/domain/permission-resolver.service.ts) —
 * PermissionResolver itself calls this as a fallback for folders/files that live inside a
 * workspace, and InvitationsModule calls it directly for org-level invites, which have no
 * Folder/File resource to resolve against at all.
 *
 * Resolution is simpler than PermissionResolver's: an organization has no parent to inherit
 * from, so there's no ancestor chain to walk.
 *   1. The org owner is always an implicit OWNER — no OrganizationMember row needed, mirroring
 *      how Folder/File ownership never needs a Permission row either.
 *   2. Otherwise, an explicit OrganizationMember row's role applies.
 *   3. No row → no access (`null`).
 */
@Injectable()
export class OrgRoleResolver {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
  ) {}

  async resolveRole(
    actorId: string,
    organizationId: string,
  ): Promise<PermissionRoleName | null> {
    const org = await this.organizations.findById(organizationId);
    if (!org) return null;
    if (org.ownerId === actorId) return 'OWNER';
    const member = await this.members.findByOrgAndUser(organizationId, actorId);
    return member?.role ?? null;
  }

  async requireRole(
    actorId: string,
    organizationId: string,
    minimumRole: PermissionRoleName,
  ): Promise<PermissionRoleName> {
    const role = await this.resolveRole(actorId, organizationId);
    if (!role || !roleMeetsMinimum(role, minimumRole)) {
      throw new ForbiddenException(
        `Insufficient role in organization ${organizationId}`,
      );
    }
    return role;
  }
}
