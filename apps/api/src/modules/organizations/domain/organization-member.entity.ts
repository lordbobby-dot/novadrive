import type { PermissionRoleName } from '../../sharing/domain/permission.entity';

/** role reuses PermissionRoleName (OWNER/ADMIN/EDITOR/VIEWER/GUEST) rather than a separate
 * organization-role type — org roles and resource roles share one rank vocabulary throughout
 * this app (see roleMeetsMinimum), which is what lets PermissionResolver fold an org member's
 * role directly into the same comparison it already does for explicit resource grants. */
export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: PermissionRoleName;
  createdAt: Date;
}
