import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';

export interface OrganizationMemberWithUser {
  member: OrganizationMember;
  email: string | null;
  name: string | null;
}

/** Prepends the owner as a synthetic OWNER-ranked entry — the owner never has a real
 * OrganizationMember row (see OrgRoleResolver), but the member-management UI needs to show them
 * alongside everyone else. Its synthetic `id` (`owner:<orgId>`) is not a real row id and can't be
 * targeted by remove/change-role, which both special-case the owner separately anyway.
 * Batch-resolves every member's userId to a display email/name in one extra query, same trick
 * ListPermissionsForResourceUseCase uses. */
@Injectable()
export class ListOrganizationMembersUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(
    actorId: string,
    organizationId: string,
  ): Promise<OrganizationMemberWithUser[]> {
    await this.orgRoles.requireRole(actorId, organizationId, 'VIEWER');
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');

    const rows = await this.members.listForOrganization(organizationId);
    const ownerEntry: OrganizationMember = {
      id: `owner:${org.id}`,
      organizationId: org.id,
      userId: org.ownerId,
      role: 'OWNER',
      createdAt: org.createdAt,
    };
    const all = [ownerEntry, ...rows];

    const users = await this.users.findByIds(all.map((m) => m.userId));
    const userById = new Map(users.map((u) => [u.id, u]));

    return all.map((member) => {
      const user = userById.get(member.userId);
      return {
        member,
        email: user?.email ?? null,
        name: user?.name ?? null,
      };
    });
  }
}
