import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../../organizations/domain/organization-member.repository';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../organizations/domain/workspace.repository';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageQuotaRepository,
} from '../../quota/domain/storage-quota.repository';
import type { AdminOrganizationSummary } from './list-admin-organizations.use-case';

/** The organization analog of SetUserQuotaUseCase — see that file for the two-layer validation
 * rationale (class-validator's @IsNumberString catches non-numeric input; this still re-checks
 * positivity as a BigInt comparison, since a numeric *string* passing @IsNumberString doesn't
 * guarantee > 0). */
@Injectable()
export class SetOrganizationQuotaUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    adminId: string,
    organizationId: string,
    limitBytes: string,
  ): Promise<AdminOrganizationSummary> {
    if (BigInt(limitBytes) <= 0n) {
      throw new BadRequestException(
        'limitBytes must be a positive number of bytes',
      );
    }

    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');

    const [memberRows, workspaceRows, quota] = await Promise.all([
      this.members.listForOrganization(organizationId),
      this.workspaces.listForOrganization(organizationId),
      this.quotas.setLimit('ORGANIZATION', organizationId, limitBytes),
    ]);

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'ORGANIZATION_QUOTA_UPDATED',
        'SUCCESS',
        adminId,
        'ORGANIZATION',
        organizationId,
        { organizationName: org.name, limitBytes },
      ),
    );

    return {
      ...org,
      memberCount: memberRows.length + 1,
      workspaceCount: workspaceRows.length,
      storageUsedBytes: quota.usedBytes,
      storageLimitBytes: quota.limitBytes,
    };
  }
}
