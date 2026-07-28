import { Inject, Injectable } from '@nestjs/common';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import type { Invitation } from '../domain/invitation.entity';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../domain/invitation.repository';

/** Seeing who's been invited (but hasn't necessarily accepted yet) is admin-level, same
 * threshold as seeing who already has access. */
@Injectable()
export class ListInvitationsForResourceUseCase {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    private readonly resolver: PermissionResolver,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(
    actorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Invitation[]> {
    if (resourceType === 'ORGANIZATION') {
      await this.orgRoles.requireRole(actorId, resourceId, 'ADMIN');
    } else {
      await this.resolver.requireRole(
        actorId,
        resourceType,
        resourceId,
        'ADMIN',
      );
    }
    return this.invitations.listForResource(resourceType, resourceId);
  }
}
