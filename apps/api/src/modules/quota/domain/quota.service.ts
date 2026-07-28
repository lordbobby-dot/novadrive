import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EnvConfig } from '../../../config/env.validation';
import {
  QUOTA_THRESHOLD_EVENT,
  QuotaThresholdEvent,
} from '../../../common/events/quota-threshold.event';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageQuotaRepository,
} from './storage-quota.repository';
import {
  percentUsed,
  type QuotaSubject,
  type QuotaSubjectType,
  type StorageQuota,
} from './storage-quota.entity';
import { QuotaExceededException } from './quota-exceeded.exception';

/** Checked highest-first so a reservation that jumps straight past several thresholds at once
 * (e.g. a single huge upload taking usage from 10% to 97%) only ever fires the highest one it
 * actually crossed, not all three. */
const THRESHOLDS = [100, 95, 80];
const LOWEST_THRESHOLD = THRESHOLDS[THRESHOLDS.length - 1];

/** The single place that knows how quota reservation, release, and threshold-crossing
 * notifications work — every caller (uploads, trash permanent-delete) goes through this rather
 * than touching StorageQuotaRepository directly. */
@Injectable()
export class QuotaService {
  constructor(
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly events: EventEmitter2,
  ) {}

  /** Atomically reserves `bytes` against `subject`'s quota — the same conditional-UPDATE pattern
   * SharedLink's download-limit enforcement uses (see docs/permissions.md), so two concurrent
   * uploads can't both succeed past the limit. Throws QuotaExceededException (413) before any S3
   * call is made if the reservation would exceed the limit. Lazily creates the subject's
   * StorageQuota row (with the configured default limit) on first use — quotas are never
   * provisioned eagerly for every user/org. */
  async reserve(subject: QuotaSubject, bytes: string): Promise<void> {
    await this.quotas.getOrCreate(
      subject.subjectType,
      subject.subjectId,
      this.defaultLimitFor(subject.subjectType),
    );

    const updated = await this.quotas.tryReserve(
      subject.subjectType,
      subject.subjectId,
      bytes,
    );
    if (!updated) {
      throw new QuotaExceededException(
        subject.subjectType === 'ORGANIZATION'
          ? "This upload would exceed the organization's storage quota"
          : 'This upload would exceed your storage quota',
      );
    }

    await this.maybeNotifyThreshold(subject, updated);
  }

  /** Releases a reservation that never became real usage (aborted, checksum-failed, or
   * quarantined upload) or that's being permanently removed (Trash permanent-delete / purge).
   * Always succeeds — a release is never itself rejected. Resets the notification ratchet once
   * usage drops back below the lowest threshold, so a later re-crossing notifies again. */
  async release(subject: QuotaSubject, bytes: string): Promise<void> {
    const updated = await this.quotas.release(
      subject.subjectType,
      subject.subjectId,
      bytes,
    );
    if (
      updated.lastNotifiedThreshold > 0 &&
      percentUsed(updated) < LOWEST_THRESHOLD
    ) {
      await this.quotas.updateLastNotifiedThreshold(
        subject.subjectType,
        subject.subjectId,
        0,
      );
    }
  }

  /** Releases every reservation in `items` (each carrying its own resolved subject and byte
   * count — see StorageObject.quotaSubjectType), grouped by subject so a permanent-delete of a
   * folder with 1000 files across, at most, one or two subjects issues one release call per
   * subject rather than one per file. Items with no subject (created outside the real upload
   * pipeline) are silently skipped — they were never reserved. */
  async releaseMany(
    items: Array<{
      size: string;
      quotaSubjectType: QuotaSubjectType | null;
      quotaSubjectId: string | null;
    }>,
  ): Promise<void> {
    const totalsBySubject = new Map<
      string,
      { subject: QuotaSubject; total: bigint }
    >();
    for (const item of items) {
      if (!item.quotaSubjectType || !item.quotaSubjectId) continue;
      const key = `${item.quotaSubjectType}:${item.quotaSubjectId}`;
      const entry = totalsBySubject.get(key);
      const bytes = BigInt(item.size);
      if (entry) {
        entry.total += bytes;
      } else {
        totalsBySubject.set(key, {
          subject: {
            subjectType: item.quotaSubjectType,
            subjectId: item.quotaSubjectId,
          },
          total: bytes,
        });
      }
    }
    await Promise.all(
      Array.from(totalsBySubject.values()).map(({ subject, total }) =>
        this.release(subject, total.toString()),
      ),
    );
  }

  private defaultLimitFor(subjectType: QuotaSubjectType): number {
    return subjectType === 'ORGANIZATION'
      ? this.config.get('DEFAULT_ORG_QUOTA_BYTES', { infer: true })
      : this.config.get('DEFAULT_USER_QUOTA_BYTES', { infer: true });
  }

  private async maybeNotifyThreshold(
    subject: QuotaSubject,
    quota: StorageQuota,
  ): Promise<void> {
    const percent = percentUsed(quota);
    const crossed = THRESHOLDS.find(
      (threshold) =>
        percent >= threshold && threshold > quota.lastNotifiedThreshold,
    );
    if (!crossed) return;

    await this.quotas.updateLastNotifiedThreshold(
      subject.subjectType,
      subject.subjectId,
      crossed,
    );
    this.events.emit(
      QUOTA_THRESHOLD_EVENT,
      new QuotaThresholdEvent(
        subject.subjectType,
        subject.subjectId,
        crossed,
        quota.usedBytes,
        quota.limitBytes,
      ),
    );
  }
}
