import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import type { PermissionRoleName } from '../../sharing/domain/permission.entity';
import type { OrganizationMember } from '../../organizations/domain/organization-member.entity';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../../organizations/domain/organization-member.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';

/** The admin-panel counterpart of ChangeMemberRoleUseCase — deliberately not reused since that
 * one calls `OrgRoleResolver.requireRole(actorId, ..., 'ADMIN')` first, which would 403 an admin
 * who isn't themselves a member of the org (see AdminModule's own doc comment on why it
 * duplicates rather than reuses this kind of self-service logic). AdminGuard is this endpoint's
 * only authorization boundary, so there's no escalation guard to check either — an admin can set
 * any role up to and including ADMIN (never OWNER; ownership moves only through
 * TransferOrganizationOwnershipUseCase). */
@Injectable()
export class AdminChangeMemberRoleUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    adminId: string,
    organizationId: string,
    targetUserId: string,
    role: PermissionRoleName,
  ): Promise<OrganizationMember> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');
    if (targetUserId === org.ownerId) {
      throw new BadRequestException(
        "Can't change the organization owner's role — use ownership transfer instead",
      );
    }
    if (role === 'OWNER') {
      throw new BadRequestException(
        "Can't grant OWNER through a role change — use ownership transfer instead",
      );
    }

    const member = await this.members.upsert({
      organizationId,
      userId: targetUserId,
      role,
    });

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'ORGANIZATION_MEMBER_ROLE_CHANGED',
        'SUCCESS',
        adminId,
        'ORGANIZATION',
        organizationId,
        { targetUserId, role },
      ),
    );

    return member;
  }
}
