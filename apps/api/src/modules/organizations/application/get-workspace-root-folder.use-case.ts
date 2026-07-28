import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../domain/workspace.repository';
import { OrgRoleResolver } from '../domain/org-role-resolver.service';

/** The frontend's entry point for navigating into a workspace — mirrors GET /folders/root for
 * personal Drive, except the folder already exists (created eagerly by CreateWorkspaceUseCase)
 * rather than being lazily created here. Once the caller has this id, every further
 * navigation/upload/share action reuses the exact same Folder/File endpoints personal Drive
 * uses. */
@Injectable()
export class GetWorkspaceRootFolderUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(actorId: string, workspaceId: string): Promise<Folder> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');
    await this.orgRoles.requireRole(
      actorId,
      workspace.organizationId,
      'VIEWER',
    );
    const root = await this.folders.findWorkspaceRoot(workspaceId);
    if (!root) throw new NotFoundException('Workspace root folder not found');
    return root;
  }
}
