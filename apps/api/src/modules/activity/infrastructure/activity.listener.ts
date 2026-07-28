import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../domain/activity.repository';

/** The only place in the app that knows the Activity table exists. Every use case elsewhere just
 * emits an ActivityEvent; this listener is what turns that into a row. Failures are logged and
 * swallowed rather than thrown — `events.emit()` is fire-and-forget, so an unhandled rejection
 * here would surface as a process-level warning with no way to alert the use case that logging
 * failed, and a broken activity write must never be allowed to affect the primary action. */
@Injectable()
export class ActivityListener {
  private readonly logger = new Logger(ActivityListener.name);

  constructor(
    @Inject(ACTIVITY_REPOSITORY) private readonly activity: ActivityRepository,
  ) {}

  @OnEvent(ACTIVITY_EVENT)
  async handleActivity(event: ActivityEvent): Promise<void> {
    try {
      await this.activity.create({
        actorId: event.actorId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata,
        ipAddress: event.ipAddress,
      });
    } catch (error) {
      this.logger.error(`Failed to record activity: ${String(error)}`);
    }
  }
}
