import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import type { AdminOrganizationSummary } from './list-admin-organizations.use-case';

/** There's no self-service ownership transfer anywhere in this app — only an admin can move an
 * organization to a different owner. Unlike the self-service member-management endpoints (which
 * require the new owner to already be a member before any role change), this deliberately allows
 * transferring to *any* existing user: an admin's authority is meant to cover recovery scenarios
 * (e.g. the original owner's account was suspended/deleted) where requiring prior membership
 * would make the org permanently unrecoverable. */
@Injectable()
export class TransferOrganizationOwnershipUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    adminId: string,
    organizationId: string,
    newOwnerId: string,
  ): Promise<AdminOrganizationSummary> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');

    if (org.ownerId !== newOwnerId) {
      const newOwner = await this.users.findById(newOwnerId);
      if (!newOwner) throw new NotFoundException('New owner not found');

      const previousOwnerId = org.ownerId;

      // The new owner becomes implicit OWNER (never a row, per OrgRoleResolver's convention) —
      // if they already held an explicit member row, it's now redundant/stale and is removed.
      const existingMembership = await this.members.findByOrgAndUser(
        organizationId,
        newOwnerId,
      );
      if (existingMembership) {
        await this.members.remove(organizationId, newOwnerId);
      }

      // The previous owner loses their implicit OWNER status — downgraded to an explicit ADMIN
      // row rather than losing access outright, so a transfer isn't also a silent eviction.
      await this.members.upsert({
        organizationId,
        userId: previousOwnerId,
        role: 'ADMIN',
      });

      await this.organizations.transferOwnership(organizationId, newOwnerId);

      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'ORGANIZATION_OWNER_TRANSFERRED',
          'SUCCESS',
          adminId,
          'ORGANIZATION',
          organizationId,
          { organizationName: org.name, previousOwnerId, newOwnerId },
        ),
      );
    }

    const updatedOrg = await this.organizations.findById(organizationId);
    if (!updatedOrg) throw new NotFoundException('Organization not found');

    const [memberRows, workspaceRows, quota] = await Promise.all([
      this.members.listForOrganization(organizationId),
      this.workspaces.listForOrganization(organizationId),
      this.quotas.findBySubject('ORGANIZATION', organizationId),
    ]);

    return {
      ...updatedOrg,
      memberCount: memberRows.length + 1,
      workspaceCount: workspaceRows.length,
      storageUsedBytes: quota?.usedBytes ?? '0',
      storageLimitBytes: quota?.limitBytes ?? null,
    };
  }
}
