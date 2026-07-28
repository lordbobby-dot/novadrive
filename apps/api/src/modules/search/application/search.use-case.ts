import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SearchResultPage } from '../domain/search-result.entity';
import {
  SEARCH_SERVICE,
  SearchQuery,
  type SearchService,
} from '../domain/search.service';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../organizations/domain/workspace.repository';

@Injectable()
export class SearchUseCase {
  constructor(
    @Inject(SEARCH_SERVICE) private readonly search: SearchService,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    private readonly orgRoles: OrgRoleResolver,
  ) {}

  async execute(query: SearchQuery): Promise<SearchResultPage> {
    if (query.workspaceId) {
      await this.requireWorkspaceAccess(query.ownerId, query.workspaceId);
    }
    return this.search.search(query);
  }

  /** A workspace is a shared pool — searching it requires VIEWER+ org membership, resolved via
   * the workspace's own organizationId, same bar as browsing into it via
   * GET /workspaces/:id/root-folder. PostgresSearchService itself trusts workspaceId
   * unconditionally, so this check is the only thing standing between "any authenticated user"
   * and "workspace members only." A nonexistent workspace id rejects the same way an
   * inaccessible real one does — never distinguishing "doesn't exist" from "you can't see it,"
   * the same anti-enumeration property PermissionResolver already holds for files/folders. */
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
