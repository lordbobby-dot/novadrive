import { Inject, Injectable } from '@nestjs/common';
import type { Organization } from '../domain/organization.entity';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository';

export interface CreateOrganizationParams {
  ownerId: string;
  name: string;
}

/** The creator becomes the org's owner — an implicit OWNER-ranked role, same as folder/file
 * ownership, so no OrganizationMember row is written for them (see OrgRoleResolver). */
@Injectable()
export class CreateOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  execute(params: CreateOrganizationParams): Promise<Organization> {
    return this.organizations.create(params);
  }
}
