import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Workspace } from '../domain/workspace.entity';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../domain/workspace.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

@Injectable()
export class GetWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(actorId: string, workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');
    await this.orgRoles.requireRole(
      actorId,
      workspace.organizationId,
      'VIEWER',
    );
    return workspace;
  }
}
