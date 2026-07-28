import { Inject, Injectable } from '@nestjs/common';
import type { Organization } from '../domain/organization.entity';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

@Injectable()
export class RenameOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(
    actorId: string,
    organizationId: string,
    name: string,
  ): Promise<Organization> {
    await this.orgRoles.requireRole(actorId, organizationId, 'ADMIN');
    return this.organizations.rename(organizationId, name);
  }
}
