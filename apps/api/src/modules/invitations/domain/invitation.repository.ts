import type {
  PermissionRoleName,
  ResourceTypeName,
} from '../../sharing/domain/permission.entity';
import type { Invitation, InvitationStatusName } from './invitation.entity';

export const INVITATION_REPOSITORY = Symbol('INVITATION_REPOSITORY');

export interface CreateInvitationParams {
  email: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  role: PermissionRoleName;
  token: string;
  invitedBy: string;
  expiresAt: Date;
}

export interface InvitationRepository {
  create(params: CreateInvitationParams): Promise<Invitation>;
  findById(id: string): Promise<Invitation | null>;
  findByToken(token: string): Promise<Invitation | null>;
  updateStatus(id: string, status: InvitationStatusName): Promise<void>;
  listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Invitation[]>;
}
