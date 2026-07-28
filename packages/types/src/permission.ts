export type ResourceType = "FILE" | "FOLDER" | "ORGANIZATION";
export type PermissionRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | "GUEST";

export interface PermissionResponse {
  id: string;
  subjectId: string;
  subjectEmail: string | null;
  subjectName: string | null;
  resourceType: ResourceType;
  resourceId: string;
  role: PermissionRole;
  grantedBy: string;
  createdAt: string;
}
