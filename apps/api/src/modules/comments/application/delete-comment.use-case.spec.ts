import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeleteCommentUseCase } from './delete-comment.use-case';
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

describe('DeleteCommentUseCase', () => {
  let comments: jest.Mocked<CommentRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: DeleteCommentUseCase;

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
    useCase = new DeleteCommentUseCase(comments, resolver);
  });

  it("throws NotFoundException when the comment doesn't exist", async () => {
    comments.findById.mockResolvedValue(null);
    await expect(useCase.execute('author-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets the comment author delete their own comment without a role check', async () => {
    comments.findById.mockResolvedValue(makeComment({ authorId: 'author-1' }));

    await useCase.execute('author-1', 'comment-1');

    expect(resolver.requireRole).not.toHaveBeenCalled();
    expect(comments.delete).toHaveBeenCalledWith('comment-1');
  });

  it('rejects a non-author with only EDITOR access (needs ADMIN+)', async () => {
    comments.findById.mockResolvedValue(makeComment({ authorId: 'author-1' }));
    resolver.requireRole.mockResolvedValue('EDITOR');

    await expect(
      useCase.execute('editor-1', 'comment-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comments.delete).not.toHaveBeenCalled();
  });

  it('allows a non-author with ADMIN+ to delete the comment', async () => {
    comments.findById.mockResolvedValue(makeComment({ authorId: 'author-1' }));
    resolver.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('admin-1', 'comment-1');

    expect(comments.delete).toHaveBeenCalledWith('comment-1');
  });
});
