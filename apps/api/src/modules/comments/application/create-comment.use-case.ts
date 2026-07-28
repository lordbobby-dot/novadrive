import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import type { Comment } from '../domain/comment.entity';
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '../domain/comment.repository';

/** Commenting only requires VIEWER+ — it's lightweight collaboration, not a content edit, so it
 * sits at a lower bar than the EDITOR role that renaming/moving/deleting require. */
@Injectable()
export class CreateCommentUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly comments: CommentRepository,
    private readonly resolver: PermissionResolver,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    authorId: string,
    resourceType: ResourceTypeName,
    resourceId: string,
    body: string,
  ): Promise<Comment> {
    await this.resolver.requireRole(
      authorId,
      resourceType,
      resourceId,
      'VIEWER',
    );

    const comment = await this.comments.create({
      resourceType,
      resourceId,
      authorId,
      body,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(authorId, 'COMMENT', resourceType, resourceId, {
        commentId: comment.id,
      }),
    );

    return comment;
  }
}
