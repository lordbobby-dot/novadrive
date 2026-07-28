import { ActivityEvent } from '../../../common/events/activity.event';
import { ActivityListener } from './activity.listener';
import type { ActivityRepository } from '../domain/activity.repository';

describe('ActivityListener', () => {
  let activity: jest.Mocked<ActivityRepository>;
  let listener: ActivityListener;

  beforeEach(() => {
    activity = { create: jest.fn(), list: jest.fn() };
    listener = new ActivityListener(activity);
  });

  it('turns an ActivityEvent into an Activity row with matching fields', async () => {
    const event = new ActivityEvent(
      'owner-1',
      'RENAME',
      'FILE',
      'file-1',
      { oldName: 'a.txt', newName: 'b.txt' },
      '203.0.113.1',
    );

    await listener.handleActivity(event);

    expect(activity.create).toHaveBeenCalledWith({
      actorId: 'owner-1',
      action: 'RENAME',
      targetType: 'FILE',
      targetId: 'file-1',
      metadata: { oldName: 'a.txt', newName: 'b.txt' },
      ipAddress: '203.0.113.1',
    });
  });

  it('swallows a repository failure rather than throwing', async () => {
    activity.create.mockRejectedValue(new Error('db unreachable'));
    const event = new ActivityEvent('owner-1', 'DELETE', 'FILE', 'file-1');

    await expect(listener.handleActivity(event)).resolves.toBeUndefined();
  });
});
