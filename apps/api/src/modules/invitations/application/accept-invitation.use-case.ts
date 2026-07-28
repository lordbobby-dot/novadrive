import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import type { Permission } from '../../sharing/domain/permission.entity';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from '../../sharing/domain/permission.repository';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../../organizations/domain/organization-member.repository';
import {
  isInvitationExpired,
  type Invitation,
} from '../domain/invitation.entity';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../domain/invitation.repository';

/** The invited user must already be signed in (the frontend's accept page sends them through
 * Clerk sign-up/sign-in first if they're new) — this is what makes "new user registers, then
 * lands with the granted role already applied" work: acceptance happens after auth, looked up by
 * the now-authenticated user's own email, not at invite time. An ORGANIZATION invite upserts an
 * OrganizationMember row instead of a Permission row — Permission only ever covers FILE/FOLDER. */
@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly organizationMembers: OrganizationMemberRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(actorId: string, token: string): Promise<Permission> {
    const invitation = await this.invitations.findByToken(token);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(
        'This invitation has already been used or revoked',
      );
    }
    if (isInvitationExpired(invitation)) {
      await this.invitations.updateStatus(invitation.id, 'EXPIRED');
      throw new BadRequestException('This invitation has expired');
    }

    const actor = await this.users.findById(actorId);
    if (!actor) {
      throw new NotFoundException('User not found');
    }
    if (actor.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    // ORGANIZATION invites grant org membership, not a Permission row — Permission only ever
    // covers FILE/FOLDER. The result is reshaped into a Permission-like object (same
    // resourceType/resourceId/role fields the frontend accept page actually reads) so the
    // controller and DTO don't need a second response shape for this one invite kind.
    const permission: Permission =
      invitation.resourceType === 'ORGANIZATION'
        ? await this.acceptOrganizationInvitation(actorId, invitation)
        : await this.permissions.upsert({
            subjectId: actorId,
            resourceType: invitation.resourceType,
            resourceId: invitation.resourceId,
            role: invitation.role,
            grantedBy: invitation.invitedBy,
          });
    await this.invitations.updateStatus(invitation.id, 'ACCEPTED');

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(
        actorId,
        'PERMISSION_CHANGE',
        invitation.resourceType,
        invitation.resourceId,
        { acceptedInvitation: true, role: invitation.role },
      ),
    );

    return permission;
  }

  private async acceptOrganizationInvitation(
    actorId: string,
    invitation: Invitation,
  ): Promise<Permission> {
    const member = await this.organizationMembers.upsert({
      organizationId: invitation.resourceId,
      userId: actorId,
      role: invitation.role,
    });
    return {
      id: member.id,
      subjectId: member.userId,
      resourceType: 'ORGANIZATION',
      resourceId: member.organizationId,
      role: member.role,
      grantedBy: invitation.invitedBy,
      createdAt: member.createdAt,
    };
  }
}
