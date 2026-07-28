import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import type { Comment } from './comment.entity';

export const COMMENT_REPOSITORY = Symbol('COMMENT_REPOSITORY');

export interface CreateCommentParams {
  resourceType: ResourceTypeName;
  resourceId: string;
  authorId: string;
  body: string;
}

export interface CommentRepository {
  create(params: CreateCommentParams): Promise<Comment>;
  findById(id: string): Promise<Comment | null>;
  listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Comment[]>;
  setResolved(id: string, resolved: boolean): Promise<Comment>;
  delete(id: string): Promise<void>;
}
