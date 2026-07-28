import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  roleMeetsMinimum,
  type PermissionRoleName,
} from '../../sharing/domain/permission.entity';
import type { OrganizationMember } from '../domain/organization-member.entity';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../domain/organization-member.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

/** Same escalation guard as GrantPermissionUseCase: the actor must already outrank (or match)
 * the role they're assigning, so an ADMIN can't mint another OWNER. The org owner can never be
 * targeted — ownership doesn't transfer through this endpoint. */
@Injectable()
export class ChangeMemberRoleUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
    private readonly orgRoles: OrgRoleResolver,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    actorId: string,
    organizationId: string,
    targetUserId: string,
    role: PermissionRoleName,
  ): Promise<OrganizationMember> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new BadRequestException('Organization not found');
    if (targetUserId === org.ownerId) {
      throw new BadRequestException(
        "Can't change the organization owner's role",
      );
    }

    const actorRole = await this.orgRoles.requireRole(
      actorId,
      organizationId,
      'ADMIN',
    );
    if (!roleMeetsMinimum(actorRole, role)) {
      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'PERMISSION_ESCALATION_ATTEMPT',
          'FAILURE',
          actorId,
          'ORGANIZATION',
          organizationId,
          { targetUserId, attemptedRole: role, actorRole },
        ),
      );
      throw new ForbiddenException("Can't grant a role higher than your own");
    }

    const member = await this.members.upsert({
      organizationId,
      userId: targetUserId,
      role,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(
        actorId,
        'PERMISSION_CHANGE',
        'ORGANIZATION',
        organizationId,
        // `subjectId`, not `targetUserId` — NotificationEventListener.resolveRecipient reads
        // metadata.subjectId for every PERMISSION_CHANGE (see GrantPermissionUseCase), same field
        // name regardless of which use case changed the role.
        {
          subjectId: targetUserId,
          role,
        },
      ),
    );
    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'PERMISSION_GRANTED',
        'SUCCESS',
        actorId,
        'ORGANIZATION',
        organizationId,
        { targetUserId, role },
      ),
    );

    return member;
  }
}
