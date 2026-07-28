import { Organization } from './organization.entity';

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');

export interface CreateOrganizationParams {
  name: string;
  ownerId: string;
}

export interface ListOrganizationsParams {
  /** Case-insensitive partial match against org name. */
  search?: string;
  cursor?: string;
  limit: number;
}

export interface OrganizationWithCounts extends Organization {
  /** Includes the implicit owner (never its own OrganizationMember row — see
   * OrgRoleResolver/schema comments), so this is always >= 1. */
  memberCount: number;
  workspaceCount: number;
}

export interface OrganizationRepository {
  create(params: CreateOrganizationParams): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  /** Every org the actor owns or is an explicit OrganizationMember of — "orgs I can see" for the
   * sidebar switcher. */
  listForActor(actorId: string): Promise<Organization[]>;
  /** Admin-wide listing (every organization on the platform, regardless of membership) — see
   * AdminModule. Returns `limit + 1` rows (caller derives the next cursor from the lookahead
   * row). */
  listAll(params: ListOrganizationsParams): Promise<OrganizationWithCounts[]>;
  rename(id: string, name: string): Promise<Organization>;
  /** Admin-only — changes `ownerId` directly, bypassing the self-service OWNER-only rename/delete
   * bar entirely (there's no self-service ownership transfer at all). Does not touch any
   * OrganizationMember row; TransferOrganizationOwnershipUseCase handles moving the old owner
   * into an explicit ADMIN row and removing the new owner's row (if any) separately, since the
   * owner is always implicit-never-a-row (see OrgRoleResolver). */
  transferOwnership(id: string, newOwnerId: string): Promise<Organization>;
  /** Cascades (via the DB schema) to every Workspace and Folder/File inside them — see
   * DeleteOrganizationUseCase. */
  delete(id: string): Promise<void>;
}
