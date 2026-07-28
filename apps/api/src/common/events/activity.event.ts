import type { ActivityAction, ActivityTargetType } from '@prisma/client';

/** The single event name every use case emits through — one generic, data-carrying event rather
 * than a class per action, so `ActivityModule`'s listener is the only place that knows Activity
 * rows exist at all. Use cases just describe what happened; they never write to the Activity
 * table directly. */
export const ACTIVITY_EVENT = 'activity';

export class ActivityEvent {
  constructor(
    public readonly actorId: string,
    public readonly action: ActivityAction,
    public readonly targetType: ActivityTargetType,
    public readonly targetId: string | null = null,
    public readonly metadata?: Record<string, unknown>,
    public readonly ipAddress?: string,
  ) {}
}
