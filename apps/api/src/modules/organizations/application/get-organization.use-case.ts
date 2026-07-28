import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Organization } from '../domain/organization.entity';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';
import type { PermissionRoleName } from '../../sharing/domain/permission.entity';

export interface OrganizationWithMyRole {
  organization: Organization;
  myRole: PermissionRoleName;
}

@Injectable()
export class GetOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(
    actorId: string,
    organizationId: string,
  ): Promise<OrganizationWithMyRole> {
    const myRole = await this.orgRoles.requireRole(
      actorId,
      organizationId,
      'VIEWER',
    );
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');
    return { organization: org, myRole };
  }
}
