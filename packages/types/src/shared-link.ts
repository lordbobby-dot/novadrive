import type { ResourceType } from "./permission";

export type LinkVisibility = "PRIVATE" | "ORG" | "PUBLIC";

export interface SharedLinkResponse {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  token: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  canView: boolean;
  canDownload: boolean;
  canComment: boolean;
  canEdit: boolean;
  visibility: LinkVisibility;
  createdAt: string;
}

export interface SharedLinkAccessResponse {
  resourceType: ResourceType;
  resourceName: string;
  contentType: string | null;
  size: string | null;
  canView: boolean;
  canDownload: boolean;
  canComment: boolean;
  canEdit: boolean;
}

/** Deliberately slimmer than the self-service folder/file responses — no ownerId/
 * organizationId/workspaceId/timestamps, since this is a public unauthenticated surface. */
export interface SharedFolderItemResponse {
  id: string;
  name: string;
}

export interface SharedFileItemResponse {
  id: string;
  name: string;
  contentType: string;
  size: string;
}

export interface CursorPageSharedFolderResponse {
  items: SharedFolderItemResponse[];
  nextCursor: string | null;
}

export interface CursorPageSharedFileResponse {
  items: SharedFileItemResponse[];
  nextCursor: string | null;
}
