import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SearchResultPage } from '../domain/search-result.entity';
import {
  SEARCH_SERVICE,
  RecentQuery,
  type SearchService,
} from '../domain/search.service';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../organizations/domain/workspace.repository';

@Injectable()
export class ListRecentUseCase {
  constructor(
    @Inject(SEARCH_SERVICE) private readonly search: SearchService,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(query: RecentQuery): Promise<SearchResultPage> {
    if (query.workspaceId) {
      await this.requireWorkspaceAccess(query.ownerId, query.workspaceId);
    }
    return this.search.listRecent(query);
  }

  /** Mirrors SearchUseCase.requireWorkspaceAccess — same anti-enumeration guarantee (a
   * nonexistent workspace id rejects identically to an inaccessible real one). */
  private async requireWorkspaceAccess(
    actorId: string,
    workspaceId: string,
  ): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new ForbiddenException(
        `Insufficient role in workspace ${workspaceId}`,
      );
    }
    await this.orgRoles.requireRole(
      actorId,
      workspace.organizationId,
      'VIEWER',
    );
  }
}
