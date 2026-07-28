import type {
  PermissionRoleName,
  ResourceTypeName,
} from '../../sharing/domain/permission.entity';

export type InvitationStatusName =
  'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface Invitation {
  id: string;
  email: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  role: PermissionRoleName;
  token: string;
  invitedBy: string;
  status: InvitationStatusName;
  expiresAt: Date;
  createdAt: Date;
}

export function isInvitationExpired(
  invitation: Invitation,
  now: Date = new Date(),
): boolean {
  return invitation.expiresAt <= now;
}
