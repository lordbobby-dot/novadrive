import type { ResourceTypeName } from '../../sharing/domain/permission.entity';

export interface Comment {
  id: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  authorId: string;
  body: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}
