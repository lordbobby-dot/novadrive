import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResolveCommentUseCase } from './resolve-comment.use-case';
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

describe('ResolveCommentUseCase', () => {
  let comments: jest.Mocked<CommentRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: ResolveCommentUseCase;

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
    useCase = new ResolveCommentUseCase(comments, resolver);
  });

  it("throws NotFoundException when the comment doesn't exist", async () => {
    comments.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('author-1', 'missing', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the comment author resolve their own comment without a role check', async () => {
    comments.findById.mockResolvedValue(makeComment({ authorId: 'author-1' }));
    comments.setResolved.mockResolvedValue(
      makeComment({ authorId: 'author-1', resolved: true }),
    );

    await useCase.execute('author-1', 'comment-1', true);

    expect(resolver.requireRole).not.toHaveBeenCalled();
    expect(comments.setResolved).toHaveBeenCalledWith('comment-1', true);
  });

  it('rejects a non-author with only VIEWER access', async () => {
    comments.findById.mockResolvedValue(makeComment({ authorId: 'author-1' }));
    resolver.requireRole.mockResolvedValue('VIEWER');

    await expect(
      useCase.execute('other-1', 'comment-1', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comments.setResolved).not.toHaveBeenCalled();
  });

  it('allows a non-author with EDITOR+ to resolve the comment', async () => {
    comments.findById.mockResolvedValue(makeComment({ authorId: 'author-1' }));
    resolver.requireRole.mockResolvedValue('EDITOR');
    comments.setResolved.mockResolvedValue(
      makeComment({ authorId: 'author-1', resolved: true }),
    );

    const result = await useCase.execute('editor-1', 'comment-1', true);

    expect(comments.setResolved).toHaveBeenCalledWith('comment-1', true);
    expect(result.resolved).toBe(true);
  });
});
