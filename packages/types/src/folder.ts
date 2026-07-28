export interface FolderResponse {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  organizationId: string | null;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}
