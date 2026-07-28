import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../domain/invitation.repository';

/** Marks a pending invitation REVOKED so its token can no longer be accepted — same ADMIN+
 * threshold as revoking an already-granted Permission (or org role, for an ORGANIZATION
 * invite). */
@Injectable()
export class RevokeInvitationUseCase {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    private readonly resolver: PermissionResolver,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(actorId: string, invitationId: string): Promise<void> {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.resourceType === 'ORGANIZATION') {
      await this.orgRoles.requireRole(actorId, invitation.resourceId, 'ADMIN');
    } else {
      await this.resolver.requireRole(
        actorId,
        invitation.resourceType,
        invitation.resourceId,
        'ADMIN',
      );
    }
    await this.invitations.updateStatus(invitationId, 'REVOKED');
  }
}
