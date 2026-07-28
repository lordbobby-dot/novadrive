import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../domain/workspace.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

/** ADMIN+ — cascades (via the DB schema) to every folder/file inside the workspace, same
 * cascade-on-delete convention as DeleteOrganizationUseCase. */
@Injectable()
export class DeleteWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(actorId: string, workspaceId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');
    await this.orgRoles.requireRole(actorId, workspace.organizationId, 'ADMIN');
    await this.workspaces.delete(workspaceId);
  }
}
