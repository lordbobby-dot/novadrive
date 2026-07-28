import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionResolver } from '../domain/permission-resolver.service';
import {
  SHARED_LINK_REPOSITORY,
  type SharedLinkRepository,
} from '../domain/shared-link.repository';

@Injectable()
export class RevokeSharedLinkUseCase {
  constructor(
    @Inject(SHARED_LINK_REPOSITORY)
    private readonly links: SharedLinkRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  async execute(actorId: string, linkId: string): Promise<void> {
    const link = await this.links.findById(linkId);
    if (!link) {
      throw new NotFoundException('Shared link not found');
    }
    await this.resolver.requireRole(
      actorId,
      link.resourceType,
      link.resourceId,
      'ADMIN',
    );
    await this.links.delete(linkId);
  }
}
