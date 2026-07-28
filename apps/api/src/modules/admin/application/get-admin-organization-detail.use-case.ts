import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Workspace } from '../../organizations/domain/workspace.entity';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../organizations/domain/workspace.repository';
import type { OrganizationMember } from '../../organizations/domain/organization-member.entity';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../../organizations/domain/organization-member.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageQuotaRepository,
} from '../../quota/domain/storage-quota.repository';
import type { OrganizationMemberWithUser } from '../../organizations/application/list-organization-members.use-case';
import type { AdminOrganizationSummary } from './list-admin-organizations.use-case';

export interface AdminOrganizationDetail {
  organization: AdminOrganizationSummary;
  members: OrganizationMemberWithUser[];
  workspaces: Workspace[];
}

/** The admin-panel counterpart of ListOrganizationMembersUseCase/ListWorkspacesForOrganizationUseCase
 * — same synthetic-owner-entry and batched-user-lookup logic, deliberately not reused directly
 * since both call `OrgRoleResolver.requireRole(actorId, ..., 'VIEWER')` first, which would 403 an
 * admin who isn't themselves a member of the org being inspected. AdminGuard is this endpoint's
 * only authorization boundary — see AdminModule's own doc comment on why it duplicates rather
 * than reuses this kind of self-service logic. */
@Injectable()
export class GetAdminOrganizationDetailUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
  ) {}

  async execute(organizationId: string): Promise<AdminOrganizationDetail> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');

    const [memberRows, workspaces, quota] = await Promise.all([
      this.members.listForOrganization(organizationId),
      this.workspaces.listForOrganization(organizationId),
      this.quotas.findBySubject('ORGANIZATION', organizationId),
    ]);

    const ownerEntry: OrganizationMember = {
      id: `owner:${org.id}`,
      organizationId: org.id,
      userId: org.ownerId,
      role: 'OWNER',
      createdAt: org.createdAt,
    };
    const allMembers = [ownerEntry, ...memberRows];

    const users = await this.users.findByIds(allMembers.map((m) => m.userId));
    const userById = new Map(users.map((u) => [u.id, u]));
    const membersWithUser: OrganizationMemberWithUser[] = allMembers.map(
      (member) => {
        const user = userById.get(member.userId);
        return {
          member,
          email: user?.email ?? null,
          name: user?.name ?? null,
        };
      },
    );

    return {
      organization: {
        ...org,
        memberCount: memberRows.length + 1,
        workspaceCount: workspaces.length,
        storageUsedBytes: quota?.usedBytes ?? '0',
        storageLimitBytes: quota?.limitBytes ?? null,
      },
      members: membersWithUser,
      workspaces,
    };
  }
}
