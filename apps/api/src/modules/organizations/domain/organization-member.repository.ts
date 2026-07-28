import type { PermissionRoleName } from '../../sharing/domain/permission.entity';
import { OrganizationMember } from './organization-member.entity';

export const ORGANIZATION_MEMBER_REPOSITORY = Symbol(
  'ORGANIZATION_MEMBER_REPOSITORY',
);

export interface UpsertOrganizationMemberParams {
  organizationId: string;
  userId: string;
  role: PermissionRoleName;
}

export interface OrganizationMemberRepository {
  /** Insert-or-update-role — used both by direct role changes and by org-invitation accept. */
  upsert(params: UpsertOrganizationMemberParams): Promise<OrganizationMember>;
  findByOrgAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null>;
  listForOrganization(organizationId: string): Promise<OrganizationMember[]>;
  /** Every org the user has an explicit membership row in — used by ListMyOrganizationsUseCase
   * to resolve each returned org's myRole in one batched query instead of one per org. Does not
   * include orgs the user owns (owner is implicit OWNER, never a row here). */
  listForUser(userId: string): Promise<OrganizationMember[]>;
  remove(organizationId: string, userId: string): Promise<void>;
}
