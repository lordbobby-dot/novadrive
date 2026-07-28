import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import { roleMeetsMinimum } from '../../sharing/domain/permission.entity';
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '../domain/comment.repository';

/** The comment's own author can always delete it; anyone else needs ADMIN+ — moderating other
 * people's comments is an elevated action, one level above resolving them. */
@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly comments: CommentRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  async execute(actorId: string, commentId: string): Promise<void> {
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
      if (!roleMeetsMinimum(role, 'ADMIN')) {
        throw new ForbiddenException(
          'Only the comment author or an admin can delete this comment',
        );
      }
    }

    await this.comments.delete(commentId);
  }
}
