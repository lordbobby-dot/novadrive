import type { ResourceTypeName } from './permission.entity';
import type { LinkVisibilityName, SharedLink } from './shared-link.entity';

export const SHARED_LINK_REPOSITORY = Symbol('SHARED_LINK_REPOSITORY');

export interface CreateSharedLinkParams {
  resourceType: ResourceTypeName;
  resourceId: string;
  token: string;
  ownerId: string;
  passwordHash?: string;
  expiresAt?: Date;
  maxDownloads?: number;
  canView: boolean;
  canDownload: boolean;
  canComment: boolean;
  canEdit: boolean;
  visibility: LinkVisibilityName;
}

export interface SharedLinkRepository {
  create(params: CreateSharedLinkParams): Promise<SharedLink>;
  findById(id: string): Promise<SharedLink | null>;
  findByToken(token: string): Promise<SharedLink | null>;
  listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<SharedLink[]>;
  delete(id: string): Promise<void>;
  /** Atomically increments downloadCount only if the limit (if any) hasn't been reached yet —
   * returns the updated link, or null if the limit was already hit. A read-then-write from the
   * application layer would race under concurrent downloads right at the limit; this is a single
   * conditional `UPDATE ... WHERE downloadCount < maxDownloads`. */
  incrementDownloadCountIfUnderLimit(id: string): Promise<SharedLink | null>;
}
