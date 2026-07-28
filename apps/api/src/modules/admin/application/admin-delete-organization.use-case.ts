import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';

/** The admin-panel counterpart of DeleteOrganizationUseCase — same irreversible cascade (via the
 * DB schema) to every workspace/folder/file inside it, but gated by AdminGuard instead of the
 * self-service OWNER-only bar, so an admin can remove an organization regardless of who owns it
 * (e.g. abuse/spam cleanup where the owner's account itself may already be suspended). */
@Injectable()
export class AdminDeleteOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(adminId: string, organizationId: string): Promise<void> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');

    await this.organizations.delete(organizationId);

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'ORGANIZATION_DELETED',
        'SUCCESS',
        adminId,
        'ORGANIZATION',
        organizationId,
        { organizationName: org.name, ownerId: org.ownerId },
      ),
    );
  }
}
