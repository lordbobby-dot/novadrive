import { ActivityEvent } from '../../../common/events/activity.event';
import { NotificationEventListener } from './notification-event.listener';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import type { Notification } from '../domain/notification.entity';
import type { NotificationRepository } from '../domain/notification.repository';
import type { UserRepository } from '../../users/domain/user.repository';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { FileRepository } from '../../files/domain/file.repository';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { User } from '../../users/domain/user.entity';
import type { Folder } from '../../folders/domain/folder.entity';
import type { File } from '../../files/domain/file.entity';
import type { Organization } from '../../organizations/domain/organization.entity';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    recipientId: 'recipient-1',
    type: 'SHARE',
    payload: {},
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('NotificationEventListener', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let users: jest.Mocked<UserRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let organizations: jest.Mocked<OrganizationRepository>;
  let realtimeEmitter: RealtimeEmitter;
  let listener: NotificationEventListener;

  beforeEach(() => {
    notifications = {
      create: jest.fn(),
      list: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
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
    folders = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdUnscoped: jest.fn(),
      findByParentId: jest.fn(),
      findRootByOwnerId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      isDescendantOf: jest.fn(),
    } as unknown as jest.Mocked<FolderRepository>;
    files = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdUnscoped: jest.fn(),
      findByFolderId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
    } as unknown as jest.Mocked<FileRepository>;
    organizations = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<OrganizationRepository>;
    realtimeEmitter = new RealtimeEmitter();
    jest.spyOn(realtimeEmitter, 'emitToUser');

    listener = new NotificationEventListener(
      notifications,
      users,
      folders,
      files,
      organizations,
      realtimeEmitter,
    );
  });

  it('ignores actions with no notification type (e.g. UPLOAD)', async () => {
    await listener.handleActivity(
      new ActivityEvent('actor-1', 'UPLOAD', 'FILE', 'file-1'),
    );

    expect(notifications.create).not.toHaveBeenCalled();
  });

  describe('PERMISSION_CHANGE', () => {
    it('notifies the subject whose access changed, resolving the actor and target names', async () => {
      users.findById.mockResolvedValue({
        name: 'Jane Granter',
        email: 'jane@example.com',
      } as unknown as User);
      files.findByIdUnscoped.mockResolvedValue({
        ownerId: 'granter-1',
        name: 'Q3 Report.pdf',
      } as unknown as File);
      notifications.create.mockResolvedValue(
        makeNotification({ recipientId: 'subject-1' }),
      );

      await listener.handleActivity(
        new ActivityEvent('granter-1', 'PERMISSION_CHANGE', 'FILE', 'file-1', {
          subjectId: 'subject-1',
          role: 'EDITOR',
        }),
      );

      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'subject-1',
        type: 'PERMISSION_CHANGE',
        payload: {
          actorId: 'granter-1',
          actorName: 'Jane Granter',
          targetType: 'FILE',
          targetId: 'file-1',
          targetName: 'Q3 Report.pdf',
          subjectId: 'subject-1',
          role: 'EDITOR',
        },
      });
      expect(realtimeEmitter.emitToUser).toHaveBeenCalledWith(
        'subject-1',
        'notification:new',
        expect.objectContaining({ recipientId: 'subject-1' }),
      );
    });

    it('falls back to email when the actor has no display name', async () => {
      users.findById.mockResolvedValue({
        name: null,
        email: 'jane@example.com',
      } as unknown as User);
      files.findByIdUnscoped.mockResolvedValue({
        ownerId: 'granter-1',
        name: 'Q3 Report.pdf',
      } as unknown as File);
      notifications.create.mockResolvedValue(
        makeNotification({ recipientId: 'subject-1' }),
      );

      await listener.handleActivity(
        new ActivityEvent('granter-1', 'PERMISSION_CHANGE', 'FILE', 'file-1', {
          subjectId: 'subject-1',
          role: 'EDITOR',
        }),
      );

      const payload = notifications.create.mock.calls[0][0].payload;
      expect(payload).toMatchObject({ actorName: 'jane@example.com' });
    });

    it('resolves an ORGANIZATION target name for an org role-change notification', async () => {
      users.findById.mockResolvedValue({
        name: 'Admin Amy',
        email: 'amy@example.com',
      } as unknown as User);
      organizations.findById.mockResolvedValue({
        name: 'Acme Corp',
      } as unknown as Organization);
      notifications.create.mockResolvedValue(
        makeNotification({ recipientId: 'subject-1' }),
      );

      await listener.handleActivity(
        new ActivityEvent(
          'admin-1',
          'PERMISSION_CHANGE',
          'ORGANIZATION',
          'org-1',
          { subjectId: 'subject-1', role: 'EDITOR' },
        ),
      );

      expect(organizations.findById).toHaveBeenCalledWith('org-1');
      const payload = notifications.create.mock.calls[0][0].payload;
      expect(payload).toMatchObject({ targetName: 'Acme Corp' });
    });

    it('skips notifying when the actor is the subject (e.g. accepting your own invitation)', async () => {
      await listener.handleActivity(
        new ActivityEvent('actor-1', 'PERMISSION_CHANGE', 'FILE', 'file-1', {
          acceptedInvitation: true,
        }),
      );

      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('COMMENT', () => {
    it('notifies the resource owner when someone else comments, resolving the folder name once', async () => {
      folders.findByIdUnscoped.mockResolvedValue({
        ownerId: 'owner-1',
        name: 'Shared Docs',
      } as unknown as Folder);
      users.findById.mockResolvedValue({
        name: 'Cara Commenter',
        email: 'cara@example.com',
      } as unknown as User);
      notifications.create.mockResolvedValue(
        makeNotification({ recipientId: 'owner-1', type: 'COMMENT' }),
      );

      await listener.handleActivity(
        new ActivityEvent('commenter-1', 'COMMENT', 'FOLDER', 'folder-1', {
          commentId: 'comment-1',
        }),
      );

      expect(folders.findByIdUnscoped).toHaveBeenCalledTimes(1);
      expect(folders.findByIdUnscoped).toHaveBeenCalledWith('folder-1');
      const call = notifications.create.mock.calls[0][0];
      expect(call.recipientId).toBe('owner-1');
      expect(call.type).toBe('COMMENT');
      expect(call.payload).toMatchObject({
        actorName: 'Cara Commenter',
        targetName: 'Shared Docs',
      });
    });

    it('skips notifying when the owner comments on their own resource', async () => {
      files.findByIdUnscoped.mockResolvedValue({
        ownerId: 'owner-1',
        name: 'report.pdf',
      } as unknown as File);

      await listener.handleActivity(
        new ActivityEvent('owner-1', 'COMMENT', 'FILE', 'file-1', {
          commentId: 'comment-1',
        }),
      );

      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('SHARE', () => {
    it('notifies the invited user when their email matches an existing account', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'invitee-1',
      } as unknown as User);
      users.findById.mockResolvedValue({
        name: 'Ivan Inviter',
        email: 'ivan@example.com',
      } as unknown as User);
      files.findByIdUnscoped.mockResolvedValue({
        ownerId: 'inviter-1',
        name: 'report.pdf',
      } as unknown as File);
      notifications.create.mockResolvedValue(
        makeNotification({ recipientId: 'invitee-1', type: 'SHARE' }),
      );

      await listener.handleActivity(
        new ActivityEvent('inviter-1', 'SHARE', 'FILE', 'file-1', {
          invitedEmail: 'invitee@example.com',
          role: 'VIEWER',
        }),
      );

      expect(users.findByEmail).toHaveBeenCalledWith('invitee@example.com');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'invitee-1', type: 'SHARE' }),
      );
    });

    it('skips notifying when the invited email has no local account yet', async () => {
      users.findByEmail.mockResolvedValue(null);

      await listener.handleActivity(
        new ActivityEvent('inviter-1', 'SHARE', 'FILE', 'file-1', {
          invitedEmail: 'nobody@example.com',
        }),
      );

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('skips notifying for a shared-link creation (no addressable recipient)', async () => {
      await listener.handleActivity(
        new ActivityEvent('owner-1', 'SHARE', 'FILE', 'file-1', {
          linkId: 'link-1',
        }),
      );

      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  it('logs and swallows errors instead of throwing (fire-and-forget)', async () => {
    notifications.create.mockRejectedValue(new Error('db unreachable'));

    await expect(
      listener.handleActivity(
        new ActivityEvent('granter-1', 'PERMISSION_CHANGE', 'FILE', 'file-1', {
          subjectId: 'subject-1',
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
