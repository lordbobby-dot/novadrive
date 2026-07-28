import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ActivityTargetType } from '@prisma/client';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import type { NotificationType } from '../domain/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from '../domain/notification.repository';

interface ResolvedTarget {
  ownerId: string | null;
  name: string;
}

const NOTIFIABLE_ACTIONS: ReadonlySet<string> = new Set([
  'SHARE',
  'PERMISSION_CHANGE',
  'COMMENT',
]);

/** The only place that knows the Notification table exists — mirrors ActivityListener's role for
 * Activity. Not every ActivityEvent names a specific, addressable recipient (see the `payload`
 * doc comment on the Notification model), so most of this listener is recipient resolution:
 *  - PERMISSION_CHANGE: metadata.subjectId is the person whose access changed. Absent (e.g. the
 *    accept-invitation flow, where the actor IS the subject) or equal to the actor means no one
 *    else to notify.
 *  - COMMENT: the resource's owner, unless they're the one commenting.
 *  - SHARE: only the create-invitation variant names anyone (metadata.invitedEmail); the
 *    create-shared-link variant has no addressable recipient and is skipped. The invited email is
 *    resolved to a local account only if one already exists — otherwise the invitation email sent
 *    by CreateInvitationUseCase is the only signal they get, same as before M8. */
@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly realtimeEmitter: RealtimeEmitter,
  ) {}

  @OnEvent(ACTIVITY_EVENT)
  async handleActivity(event: ActivityEvent): Promise<void> {
    if (!NOTIFIABLE_ACTIONS.has(event.action)) {
      return;
    }

    try {
      const target = await this.resolveTarget(event.targetType, event.targetId);
      const recipientId = await this.resolveRecipient(event, target);
      if (!recipientId || recipientId === event.actorId) {
        return;
      }

      // Resolved once here rather than left to the frontend, so the toast/dropdown can name who
      // did what ("Jane shared Q3 Report.pdf") without a round-trip per notification — see
      // docs/realtime.md.
      const actor = await this.users.findById(event.actorId);

      const notification = await this.notifications.create({
        recipientId,
        type: event.action as NotificationType,
        payload: {
          actorId: event.actorId,
          actorName: actor?.name ?? actor?.email ?? null,
          targetType: event.targetType,
          targetId: event.targetId,
          targetName: target?.name ?? null,
          ...event.metadata,
        },
      });

      this.realtimeEmitter.emitToUser(
        recipientId,
        'notification:new',
        notification,
      );
    } catch (error) {
      this.logger.error(`Failed to create notification: ${String(error)}`);
    }
  }

  private async resolveRecipient(
    event: ActivityEvent,
    target: ResolvedTarget | null,
  ): Promise<string | null> {
    switch (event.action) {
      case 'PERMISSION_CHANGE': {
        const subjectId = event.metadata?.subjectId;
        return typeof subjectId === 'string' ? subjectId : null;
      }
      case 'COMMENT':
        return target?.ownerId ?? null;
      case 'SHARE': {
        const invitedEmail = event.metadata?.invitedEmail;
        if (typeof invitedEmail !== 'string') {
          return null;
        }
        const user = await this.users.findByEmail(invitedEmail);
        return user?.id ?? null;
      }
      default:
        return null;
    }
  }

  /** Single lookup shared by recipient resolution (COMMENT needs the resource's owner) and
   * payload building (every notifiable action wants the target's display name) — avoids fetching
   * the same folder/file/organization row twice. */
  private async resolveTarget(
    targetType: ActivityTargetType,
    targetId: string | null,
  ): Promise<ResolvedTarget | null> {
    if (!targetId) {
      return null;
    }
    if (targetType === 'FOLDER') {
      const folder = await this.folders.findByIdUnscoped(targetId);
      return folder ? { ownerId: folder.ownerId, name: folder.name } : null;
    }
    if (targetType === 'FILE') {
      const file = await this.files.findByIdUnscoped(targetId);
      return file ? { ownerId: file.ownerId, name: file.name } : null;
    }
    if (targetType === 'ORGANIZATION') {
      const org = await this.organizations.findById(targetId);
      return org ? { ownerId: null, name: org.name } : null;
    }
    return null;
  }
}
