import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../domain/organization-member.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

@Injectable()
export class RemoveOrganizationMemberUseCase {
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
  ): Promise<void> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new BadRequestException('Organization not found');
    if (targetUserId === org.ownerId) {
      throw new BadRequestException("Can't remove the organization owner");
    }

    await this.orgRoles.requireRole(actorId, organizationId, 'ADMIN');
    await this.members.remove(organizationId, targetUserId);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(
        actorId,
        'PERMISSION_CHANGE',
        'ORGANIZATION',
        organizationId,
        {
          targetUserId,
          revoked: true,
        },
      ),
    );
    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'PERMISSION_REVOKED',
        'SUCCESS',
        actorId,
        'ORGANIZATION',
        organizationId,
        { targetUserId },
      ),
    );
  }
}
