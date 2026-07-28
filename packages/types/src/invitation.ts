import type { PermissionRole, ResourceType } from "./permission";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface InvitationResponse {
  id: string;
  email: string;
  resourceType: ResourceType;
  resourceId: string;
  role: PermissionRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}
