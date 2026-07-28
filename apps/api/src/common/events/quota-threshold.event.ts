import type { QuotaSubjectType } from '../../modules/quota/domain/storage-quota.entity';

/** Emitted by QuotaService when a reservation pushes a subject's usage past a new upward
 * threshold (80/95/100) it hasn't already been notified about — see QuotaService.reserve. Not a
 * translation of an ActivityEvent like most Notification-producing events (there's no user
 * "action" here), so this is its own dedicated bus, consumed by a small listener in
 * NotificationsModule that resolves the actual recipient(s): the subject themself for USER, every
 * member for ORGANIZATION. */
export const QUOTA_THRESHOLD_EVENT = 'quota.threshold';

export class QuotaThresholdEvent {
  constructor(
    public readonly subjectType: QuotaSubjectType,
    public readonly subjectId: string,
    public readonly thresholdPercent: number,
    public readonly usedBytes: string,
    public readonly limitBytes: string,
  ) {}
}
