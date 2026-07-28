import type { PermissionRole } from "./permission";

export interface OrganizationResponse {
  id: string;
  name: string;
  ownerId: string;
  myRole: PermissionRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceResponse {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberResponse {
  id: string;
  organizationId: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: PermissionRole;
  createdAt: string;
}
