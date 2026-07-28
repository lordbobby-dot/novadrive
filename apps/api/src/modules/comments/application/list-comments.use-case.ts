import { Inject, Injectable } from '@nestjs/common';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import type { Comment } from '../domain/comment.entity';
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '../domain/comment.repository';

export interface CommentWithAuthor {
  comment: Comment;
  authorEmail: string | null;
  authorName: string | null;
}

/** Batch-resolves every comment's authorId to a display email/name in one extra query rather
 * than one per comment — see ListPermissionsForResourceUseCase for the same pattern. */
@Injectable()
export class ListCommentsUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly comments: CommentRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  async execute(
    actorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<CommentWithAuthor[]> {
    await this.resolver.requireRole(
      actorId,
      resourceType,
      resourceId,
      'VIEWER',
    );
    const rows = await this.comments.listForResource(resourceType, resourceId);

    const authors = await this.users.findByIds(
      rows.map((comment) => comment.authorId),
    );
    const authorById = new Map(authors.map((user) => [user.id, user]));

    return rows.map((comment) => {
      const author = authorById.get(comment.authorId);
      return {
        comment,
        authorEmail: author?.email ?? null,
        authorName: author?.name ?? null,
      };
    });
  }
}
