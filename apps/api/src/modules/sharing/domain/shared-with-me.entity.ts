import type { PermissionRoleName } from './permission.entity';

/** A row from a resource directly granted to the caller (not owned by them, not inherited via
 * org/workspace membership — see PermissionRepository.listGrantedToSubject for the exact scope). */
export interface SharedWithMeRow {
  type: 'file' | 'folder';
  id: string;
  name: string;
  parentOrFolderId: string | null;
  contentType: string | null;
  size: string | null;
  role: PermissionRoleName;
  ownerId: string;
  grantedAt: Date;
}

export interface SharedWithMeItem extends SharedWithMeRow {
  ownerName: string | null;
}

export interface SharedWithMePage {
  items: SharedWithMeItem[];
  nextCursor: string | null;
}
