import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SEARCH_SERVICE } from './domain/search.service';
import { PostgresSearchService } from './infrastructure/postgres-search.service';
import { SearchUseCase } from './application/search.use-case';
import { ListRecentUseCase } from './application/list-recent.use-case';
import { ListFavoritesUseCase } from './application/list-favorites.use-case';
import { SearchController } from './interface/search.controller';

/** No FoldersModule/FilesModule import — PostgresSearchService queries File/Folder directly via
 * raw SQL (a UNION across both, ranked and paginated together) rather than composing their
 * repositories, since that cross-entity query isn't expressible cleanly through two separate
 * per-entity repositories. The SearchService port is what stays stable if this is ever swapped
 * for a dedicated search engine — the controller/use-case layer never touches Prisma directly.
 * OrganizationsModule is imported solely for WORKSPACE_REPOSITORY/OrgRoleResolver, used by
 * SearchUseCase/ListRecentUseCase to authorize workspace-scoped queries. */
@Module({
  imports: [OrganizationsModule],
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_SERVICE, useClass: PostgresSearchService },
    SearchUseCase,
    ListRecentUseCase,
    ListFavoritesUseCase,
  ],
})
export class SearchModule {}
