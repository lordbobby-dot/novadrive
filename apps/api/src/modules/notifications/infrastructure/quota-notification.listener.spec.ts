import { QuotaNotificationListener } from './quota-notification.listener';
import { QuotaThresholdEvent } from '../../../common/events/quota-threshold.event';
import type { NotificationRepository } from '../domain/notification.repository';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';

describe('QuotaNotificationListener', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let organizations: jest.Mocked<OrganizationRepository>;
  let organizationMembers: jest.Mocked<OrganizationMemberRepository>;
  let realtimeEmitter: RealtimeEmitter;
  let listener: QuotaNotificationListener;

  beforeEach(() => {
    notifications = {
      create: jest.fn().mockResolvedValue({
        id: 'notif-1',
        recipientId: 'x',
        type: 'QUOTA_WARNING',
        payload: {},
        readAt: null,
        createdAt: new Date(),
      }),
      list: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    organizations = {
      create: jest.fn(),
      findById: jest.fn(),
      listForActor: jest.fn(),
      listAll: jest.fn(),
      rename: jest.fn(),
      transferOwnership: jest.fn(),
      delete: jest.fn(),
    };
    organizationMembers = {
      upsert: jest.fn(),
      findByOrgAndUser: jest.fn(),
      listForOrganization: jest.fn(),
      listForUser: jest.fn(),
      remove: jest.fn(),
    };
    realtimeEmitter = new RealtimeEmitter();
    jest.spyOn(realtimeEmitter, 'emitToUser');
    listener = new QuotaNotificationListener(
      notifications,
      organizations,
      organizationMembers,
      realtimeEmitter,
    );
  });

  it('notifies just the subject for a USER threshold event, without an org lookup or a subjectName', async () => {
    await listener.handleQuotaThreshold(
      new QuotaThresholdEvent('USER', 'owner-1', 80, '800', '1000'),
    );

    expect(organizations.findById).not.toHaveBeenCalled();
    expect(notifications.create).toHaveBeenCalledTimes(1);
    const call = notifications.create.mock.calls[0][0];
    expect(call.recipientId).toBe('owner-1');
    expect(call.type).toBe('QUOTA_WARNING');
    expect(call.payload).toMatchObject({ subjectName: null });
    expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
      'owner-1',
      'notification:new',
      expect.anything(),
    );
  });

  it('notifies the owner and every explicit member for an ORGANIZATION threshold event', async () => {
    organizations.findById.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      ownerId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    organizationMembers.listForOrganization.mockResolvedValue([
      {
        id: 'm-1',
        organizationId: 'org-1',
        userId: 'editor-1',
        role: 'EDITOR',
        createdAt: new Date(),
      },
      {
        id: 'm-2',
        organizationId: 'org-1',
        userId: 'viewer-1',
        role: 'VIEWER',
        createdAt: new Date(),
      },
    ]);

    await listener.handleQuotaThreshold(
      new QuotaThresholdEvent('ORGANIZATION', 'org-1', 95, '9500', '10000'),
    );

    expect(notifications.create).toHaveBeenCalledTimes(3);
    expect(organizations.findById).toHaveBeenCalledTimes(1);
    const recipients = notifications.create.mock.calls.map(
      (call) => call[0].recipientId,
    );
    expect(recipients.sort()).toEqual(
      ['editor-1', 'owner-1', 'viewer-1'].sort(),
    );
    for (const call of notifications.create.mock.calls) {
      expect(call[0].payload).toMatchObject({ subjectName: 'Acme' });
    }
  });

  it('does nothing (but does not throw) when the organization no longer exists', async () => {
    organizations.findById.mockResolvedValue(null);

    await listener.handleQuotaThreshold(
      new QuotaThresholdEvent('ORGANIZATION', 'missing-org', 80, '800', '1000'),
    );

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('swallows errors rather than crashing the event loop', async () => {
    notifications.create.mockRejectedValue(new Error('db unreachable'));

    await expect(
      listener.handleQuotaThreshold(
        new QuotaThresholdEvent('USER', 'owner-1', 80, '800', '1000'),
      ),
    ).resolves.toBeUndefined();
  });
});
