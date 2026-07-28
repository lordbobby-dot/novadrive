import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../../organizations/domain/organization-member.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';

/** The admin-panel counterpart of RemoveOrganizationMemberUseCase — deliberately not reused for
 * the same reason as AdminChangeMemberRoleUseCase (OrgRoleResolver.requireRole would 403 an
 * admin who isn't themselves a member). AdminGuard is this endpoint's only authorization
 * boundary. */
@Injectable()
export class AdminRemoveOrganizationMemberUseCase {
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
  ): Promise<void> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');
    if (targetUserId === org.ownerId) {
      throw new BadRequestException("Can't remove the organization owner");
    }

    await this.members.remove(organizationId, targetUserId);

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'ORGANIZATION_MEMBER_REMOVED',
        'SUCCESS',
        adminId,
        'ORGANIZATION',
        organizationId,
        { targetUserId },
      ),
    );
  }
}
