import { Inject, Injectable } from '@nestjs/common';
import type { Workspace } from '../domain/workspace.entity';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../domain/workspace.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';

export interface CreateWorkspaceParams {
  actorId: string;
  organizationId: string;
  name: string;
}

/** Creates the workspace and its root Folder (parentId null, workspaceId set) in one action —
 * the org-scoped equivalent of a personal "My Drive" root, except created eagerly here rather
 * than lazily on first request the way GetOrCreateRootFolderUseCase works for a user account:
 * a workspace is a deliberate, admin-level action, so there's no "first request" moment to hook
 * lazy creation into. `ownerId` on the root folder is the creator (every Folder needs a non-null
 * owner); it grants them nothing beyond what their org role already would, since
 * PermissionResolver checks org role as a fallback regardless of who created the folder. */
@Injectable()
export class CreateWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(params: CreateWorkspaceParams): Promise<Workspace> {
    await this.orgRoles.requireRole(
      params.actorId,
      params.organizationId,
      'ADMIN',
    );

    const workspace = await this.workspaces.create({
      organizationId: params.organizationId,
      name: params.name,
    });

    await this.folders.createWorkspaceRoot({
      ownerId: params.actorId,
      organizationId: params.organizationId,
      workspaceId: workspace.id,
      name: workspace.name,
    });

    return workspace;
  }
}
