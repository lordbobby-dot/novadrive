import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { PermissionResolver } from '../domain/permission-resolver.service';
import type { ResourceTypeName } from '../domain/permission.entity';
import type {
  LinkVisibilityName,
  SharedLink,
} from '../domain/shared-link.entity';
import {
  SHARED_LINK_REPOSITORY,
  type SharedLinkRepository,
} from '../domain/shared-link.repository';
import { hashPassword } from '../infrastructure/password-hash';

export interface CreateSharedLinkParams {
  ownerId: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  password?: string;
  expiresAt?: Date;
  maxDownloads?: number;
  canView?: boolean;
  canDownload?: boolean;
  canComment?: boolean;
  canEdit?: boolean;
  visibility?: LinkVisibilityName;
}

/** Creating a public link is an ADMIN+ action — same threshold as granting a Permission, since a
 * link effectively grants access to anyone who has the URL. */
@Injectable()
export class CreateSharedLinkUseCase {
  constructor(
    @Inject(SHARED_LINK_REPOSITORY)
    private readonly links: SharedLinkRepository,
    private readonly resolver: PermissionResolver,
    private readonly events: EventEmitter2,
  ) {}

  async execute(params: CreateSharedLinkParams): Promise<SharedLink> {
    await this.resolver.requireRole(
      params.ownerId,
      params.resourceType,
      params.resourceId,
      'ADMIN',
    );

    const token = randomBytes(24).toString('base64url');
    const passwordHash = params.password
      ? await hashPassword(params.password)
      : undefined;

    const link = await this.links.create({
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      token,
      ownerId: params.ownerId,
      passwordHash,
      expiresAt: params.expiresAt,
      maxDownloads: params.maxDownloads,
      canView: params.canView ?? true,
      canDownload: params.canDownload ?? true,
      canComment: params.canComment ?? false,
      canEdit: params.canEdit ?? false,
      visibility: params.visibility ?? 'PRIVATE',
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(
        params.ownerId,
        'SHARE',
        params.resourceType,
        params.resourceId,
        {
          linkId: link.id,
        },
      ),
    );

    return link;
  }
}
