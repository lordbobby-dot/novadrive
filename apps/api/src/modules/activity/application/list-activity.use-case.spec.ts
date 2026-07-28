import { ForbiddenException } from '@nestjs/common';
import { ListActivityUseCase } from './list-activity.use-case';
import type { Activity } from '../domain/activity.entity';
import type { ActivityRepository } from '../domain/activity.repository';
import type { PermissionResolver } from '../../sharing/domain/permission-resolver.service';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    actorId: 'owner-1',
    action: 'RENAME',
    targetType: 'FILE',
    targetId: 'file-1',
    metadata: null,
    ipAddress: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListActivityUseCase', () => {
  let activity: jest.Mocked<ActivityRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: ListActivityUseCase;

  beforeEach(() => {
    activity = {
      create: jest.fn(),
      list: jest.fn(),
    };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    useCase = new ListActivityUseCase(activity, resolver);
  });

  it('scopes the account-level feed (no targetId) to the viewer, with no permission check', async () => {
    activity.list.mockResolvedValue([makeActivity()]);

    await useCase.execute({ ownerId: 'viewer-1', limit: 20 });

    expect(resolver.requireRole).not.toHaveBeenCalled();
    expect(activity.list).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'viewer-1', targetId: undefined }),
    );
  });

  it('treats a non-shareable targetType (ACCOUNT) as still actor-scoped', async () => {
    activity.list.mockResolvedValue([]);

    await useCase.execute({
      ownerId: 'viewer-1',
      targetId: 'viewer-1',
      targetType: 'ACCOUNT',
      limit: 20,
    });

    expect(resolver.requireRole).not.toHaveBeenCalled();
    expect(activity.list).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'viewer-1' }),
    );
  });

  it('gates a per-resource feed on VIEWER and shows every actor, not just the viewer', async () => {
    resolver.requireRole.mockResolvedValue('VIEWER');
    activity.list.mockResolvedValue([
      makeActivity({ actorId: 'collaborator-1' }),
      makeActivity({ actorId: 'owner-1' }),
    ]);

    await useCase.execute({
      ownerId: 'viewer-1',
      targetId: 'file-1',
      targetType: 'FILE',
      limit: 20,
    });

    expect(resolver.requireRole).toHaveBeenCalledWith(
      'viewer-1',
      'FILE',
      'file-1',
      'VIEWER',
    );
    expect(activity.list).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: undefined, targetId: 'file-1' }),
    );
  });

  it('rejects a per-resource feed when the viewer lacks access', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());

    await expect(
      useCase.execute({
        ownerId: 'viewer-1',
        targetId: 'file-1',
        targetType: 'FILE',
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(activity.list).not.toHaveBeenCalled();
  });
});
