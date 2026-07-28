import type { ResourceTypeName } from './permission.entity';

export type LinkVisibilityName = 'PRIVATE' | 'ORG' | 'PUBLIC';

export interface SharedLink {
  id: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  token: string;
  ownerId: string;
  passwordHash: string | null;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  canView: boolean;
  canDownload: boolean;
  canComment: boolean;
  canEdit: boolean;
  visibility: LinkVisibilityName;
  createdAt: Date;
}

export function isSharedLinkExpired(
  link: SharedLink,
  now: Date = new Date(),
): boolean {
  return link.expiresAt !== null && link.expiresAt <= now;
}

export function isSharedLinkDownloadLimitReached(link: SharedLink): boolean {
  return link.maxDownloads !== null && link.downloadCount >= link.maxDownloads;
}
