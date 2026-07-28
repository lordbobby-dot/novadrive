import { Inject, Injectable } from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../domain/organization-member.repository';
import type { PermissionRoleName } from '../../sharing/domain/permission.entity';
import type { OrganizationWithMyRole } from './get-organization.use-case';

@Injectable()
export class ListMyOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly members: OrganizationMemberRepository,
  ) {}

  async execute(actorId: string): Promise<OrganizationWithMyRole[]> {
    const orgs = await this.organizations.listForActor(actorId);
    const memberships = await this.members.listForUser(actorId);
    const roleByOrgId = new Map<string, PermissionRoleName>(
      memberships.map((m) => [m.organizationId, m.role]),
    );

    return orgs.map((organization) => ({
      organization,
      myRole:
        organization.ownerId === actorId
          ? 'OWNER'
          : (roleByOrgId.get(organization.id) ?? 'GUEST'),
    }));
  }
}
