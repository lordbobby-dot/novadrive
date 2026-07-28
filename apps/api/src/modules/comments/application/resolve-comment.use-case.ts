import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import { roleMeetsMinimum } from '../../sharing/domain/permission.entity';
import type { Comment } from '../domain/comment.entity';
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '../domain/comment.repository';

/** The comment's own author can always resolve/unresolve their own comment; anyone else needs
 * EDITOR+ — managing the discussion thread is closer to "editing" than to "viewing". */
@Injectable()
export class ResolveCommentUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly comments: CommentRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  async execute(
    actorId: string,
    commentId: string,
    resolved: boolean,
  ): Promise<Comment> {
    const comment = await this.comments.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== actorId) {
      const role = await this.resolver.requireRole(
        actorId,
        comment.resourceType,
        comment.resourceId,
        'VIEWER',
      );
      if (!roleMeetsMinimum(role, 'EDITOR')) {
        throw new ForbiddenException(
          'Only the comment author or an editor can resolve this comment',
        );
      }
    }

    return this.comments.setResolved(commentId, resolved);
  }
}
