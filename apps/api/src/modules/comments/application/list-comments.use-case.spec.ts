import { ForbiddenException } from '@nestjs/common';
import { ListCommentsUseCase } from './list-comments.use-case';
import type { Comment } from '../domain/comment.entity';
import type { CommentRepository } from '../domain/comment.repository';
import type { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'author-1',
    clerkId: 'clerk-author-1',
    email: 'author@example.com',
    name: 'Author',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ListCommentsUseCase', () => {
  let comments: jest.Mocked<CommentRepository>;
  let users: jest.Mocked<UserRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: ListCommentsUseCase;

  beforeEach(() => {
    comments = {
      create: jest.fn(),
      findById: jest.fn(),
      listForResource: jest.fn(),
      setResolved: jest.fn(),
      delete: jest.fn(),
    };
    users = {
      findByClerkId: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByIds: jest.fn(),
      upsertFromClerk: jest.fn(),
      deleteByClerkId: jest.fn(),
      list: jest.fn(),
      setSystemAdmin: jest.fn(),
      setSuspended: jest.fn(),
    };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    useCase = new ListCommentsUseCase(comments, users, resolver);
  });

  it('requires VIEWER+ before listing comments', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'FILE', 'file-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comments.listForResource).not.toHaveBeenCalled();
  });

  it('returns every comment on the resource, enriched with the author email/name, once authorized', async () => {
    resolver.requireRole.mockResolvedValue('VIEWER');
    const rows: Comment[] = [
      {
        id: 'comment-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
        authorId: 'author-1',
        body: 'Hi',
        resolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    comments.listForResource.mockResolvedValue(rows);
    users.findByIds.mockResolvedValue([makeUser()]);

    const result = await useCase.execute('actor-1', 'FILE', 'file-1');

    expect(comments.listForResource).toHaveBeenCalledWith('FILE', 'file-1');
    expect(users.findByIds).toHaveBeenCalledWith(['author-1']);
    expect(result).toEqual([
      {
        comment: rows[0],
        authorEmail: 'author@example.com',
        authorName: 'Author',
      },
    ]);
  });

  it('leaves email/name null when the author user record is missing', async () => {
    resolver.requireRole.mockResolvedValue('VIEWER');
    const rows: Comment[] = [
      {
        id: 'comment-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
        authorId: 'deleted-user',
        body: 'Hi',
        resolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    comments.listForResource.mockResolvedValue(rows);
    users.findByIds.mockResolvedValue([]);

    const result = await useCase.execute('actor-1', 'FILE', 'file-1');

    expect(result[0].authorEmail).toBeNull();
    expect(result[0].authorName).toBeNull();
  });
});
