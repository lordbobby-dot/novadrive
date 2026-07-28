import { Inject, Injectable } from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

/** OWNER-only — deleting an organization cascades (via the DB schema) to every workspace and
 * every folder/file inside them, the same cascade-on-owner-delete convention this app already
 * uses for deleting a User (see schema.prisma). A deliberately high bar, not soft-deletable or
 * reversible. */
@Injectable()
export class DeleteOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(actorId: string, organizationId: string): Promise<void> {
    await this.orgRoles.requireRole(actorId, organizationId, 'OWNER');
    await this.organizations.delete(organizationId);
  }
}
