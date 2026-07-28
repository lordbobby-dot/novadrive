import { Inject, Injectable } from '@nestjs/common';
import { PermissionResolver } from '../domain/permission-resolver.service';
import type { ResourceTypeName } from '../domain/permission.entity';
import type { SharedLink } from '../domain/shared-link.entity';
import {
  SHARED_LINK_REPOSITORY,
  type SharedLinkRepository,
} from '../domain/shared-link.repository';

@Injectable()
export class ListSharedLinksForResourceUseCase {
  constructor(
    @Inject(SHARED_LINK_REPOSITORY)
    private readonly links: SharedLinkRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  async execute(
    actorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<SharedLink[]> {
    await this.resolver.requireRole(actorId, resourceType, resourceId, 'ADMIN');
    return this.links.listForResource(resourceType, resourceId);
  }
}
