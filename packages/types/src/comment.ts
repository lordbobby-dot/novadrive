import type { ResourceType } from "./permission";

export interface CommentResponse {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  authorId: string;
  authorEmail: string | null;
  authorName: string | null;
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}
