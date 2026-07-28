import { ForbiddenException } from '@nestjs/common';
import { CreateCommentUseCase } from './create-comment.use-case';
import type { Comment } from '../domain/comment.entity';
import type { CommentRepository } from '../domain/comment.repository';
import type { PermissionResolver } from '../../sharing/domain/permission-resolver.service';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1',
    resourceType: 'FILE',
    resourceId: 'file-1',
    authorId: 'author-1',
    body: 'Looks good',
    resolved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CreateCommentUseCase', () => {
  let comments: jest.Mocked<CommentRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let events: { emit: jest.Mock };
  let useCase: CreateCommentUseCase;

  beforeEach(() => {
    comments = {
      create: jest.fn(),
      findById: jest.fn(),
      listForResource: jest.fn(),
      setResolved: jest.fn(),
      delete: jest.fn(),
    };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    events = { emit: jest.fn() };
    useCase = new CreateCommentUseCase(
      comments,
      resolver,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it('requires VIEWER+ on the resource', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('author-1', 'FILE', 'file-1', 'Hi'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comments.create).not.toHaveBeenCalled();
  });

  it('creates the comment and emits a COMMENT activity event once authorized', async () => {
    resolver.requireRole.mockResolvedValue('VIEWER');
    comments.create.mockResolvedValue(makeComment());

    const result = await useCase.execute(
      'author-1',
      'FILE',
      'file-1',
      'Looks good',
    );

    expect(comments.create).toHaveBeenCalledWith({
      resourceType: 'FILE',
      resourceId: 'file-1',
      authorId: 'author-1',
      body: 'Looks good',
    });
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'author-1',
        action: 'COMMENT',
        targetType: 'FILE',
        targetId: 'file-1',
      }),
    );
    expect(result.body).toBe('Looks good');
  });
});
