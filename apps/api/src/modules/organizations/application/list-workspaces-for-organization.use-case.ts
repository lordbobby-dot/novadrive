import { Inject, Injectable } from '@nestjs/common';
import type { Workspace } from '../domain/workspace.entity';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../domain/workspace.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

@Injectable()
export class ListWorkspacesForOrganizationUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(actorId: string, organizationId: string): Promise<Workspace[]> {
    await this.orgRoles.requireRole(actorId, organizationId, 'VIEWER');
    return this.workspaces.listForOrganization(organizationId);
  }
}
