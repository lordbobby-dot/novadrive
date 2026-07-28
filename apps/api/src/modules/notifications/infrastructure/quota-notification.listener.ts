import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  QUOTA_THRESHOLD_EVENT,
  QuotaThresholdEvent,
} from '../../../common/events/quota-threshold.event';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from '../domain/notification.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';
import {
  ORGANIZATION_MEMBER_REPOSITORY,
  type OrganizationMemberRepository,
} from '../../organizations/domain/organization-member.repository';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';

/** A second small listener alongside NotificationEventListener, not folded into it — quota
 * threshold crossings aren't a translation of an ActivityEvent (there's no user "action"), and
 * they can address multiple recipients at once (every org member) rather than the single-
 * recipient resolution NotificationEventListener does. Still the same "one listener owns how
 * this particular event becomes rows" pattern. */
@Injectable()
export class QuotaNotificationListener {
  private readonly logger = new Logger(QuotaNotificationListener.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_MEMBER_REPOSITORY)
    private readonly organizationMembers: OrganizationMemberRepository,
    private readonly realtimeEmitter: RealtimeEmitter,
  ) {}

  @OnEvent(QUOTA_THRESHOLD_EVENT)
  async handleQuotaThreshold(event: QuotaThresholdEvent): Promise<void> {
    try {
      const { recipientIds, subjectName } = await this.resolveRecipients(event);
      const payload = {
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        // Only resolved for ORGANIZATION — a USER-subject warning is always about the
        // recipient's own account, so naming it back to them adds nothing a personal pronoun
        // doesn't already say.
        subjectName,
        thresholdPercent: event.thresholdPercent,
        usedBytes: event.usedBytes,
        limitBytes: event.limitBytes,
      };

      await Promise.all(
        recipientIds.map(async (recipientId) => {
          const notification = await this.notifications.create({
            recipientId,
            type: 'QUOTA_WARNING',
            payload,
          });
          this.realtimeEmitter.emitToUser(
            recipientId,
            'notification:new',
            notification,
          );
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to create quota-warning notification: ${String(error)}`,
      );
    }
  }

  /** USER subject: just themself, no org lookup needed. ORGANIZATION subject: the owner plus
   * every explicit member — a shared pool crossing a threshold is everyone's problem, not just
   * whoever's upload tipped it over — plus the org's own name, resolved here rather than with a
   * second query since this method already fetches the row for ownerId. */
  private async resolveRecipients(
    event: QuotaThresholdEvent,
  ): Promise<{ recipientIds: string[]; subjectName: string | null }> {
    if (event.subjectType === 'USER') {
      return { recipientIds: [event.subjectId], subjectName: null };
    }

    const org = await this.organizations.findById(event.subjectId);
    if (!org) return { recipientIds: [], subjectName: null };

    const members = await this.organizationMembers.listForOrganization(
      event.subjectId,
    );
    return {
      recipientIds: [org.ownerId, ...members.map((member) => member.userId)],
      subjectName: org.name,
    };
  }
}
