export type PermissionRoleName =
  'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'GUEST';
/** ORGANIZATION is only ever used by Invitation (an org-level invite) — Permission itself never
 * receives it, since org-level access is resolved by OrgRoleResolver against OrganizationMember,
 * not the Permission table. */
export type ResourceTypeName = 'FILE' | 'FOLDER' | 'ORGANIZATION';

export interface Permission {
  id: string;
  subjectId: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  role: PermissionRoleName;
  grantedBy: string;
  createdAt: Date;
}

/** OWNER > ADMIN > EDITOR > VIEWER > GUEST. Numeric so "does role X meet minimum role Y" is a
 * single comparison rather than a lookup table of every pairwise combination. */
const ROLE_RANK: Record<PermissionRoleName, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
  GUEST: 0,
};

export function roleMeetsMinimum(
  role: PermissionRoleName,
  minimum: PermissionRoleName,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
