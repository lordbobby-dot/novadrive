import type { QuotaSubjectType, StorageQuota } from './storage-quota.entity';

export const STORAGE_QUOTA_REPOSITORY = Symbol('STORAGE_QUOTA_REPOSITORY');

export interface StorageBreakdownEntry {
  contentType: string;
  totalBytes: string;
}

export interface StorageQuotaRepository {
  findBySubject(
    subjectType: QuotaSubjectType,
    subjectId: string,
  ): Promise<StorageQuota | null>;
  /** Batched lookup — used by admin org listing to resolve every returned org's usage in one
   * round trip instead of one query per org. Subjects with no row yet (never attempted an
   * upload) simply don't appear in the result. */
  findManyBySubjects(
    subjectType: QuotaSubjectType,
    subjectIds: string[],
  ): Promise<StorageQuota[]>;
  /** Insert-with-default-limit-or-return-existing — a single upsert, safe under concurrent first
   * uploads for the same brand-new subject. */
  getOrCreate(
    subjectType: QuotaSubjectType,
    subjectId: string,
    defaultLimitBytes: number,
  ): Promise<StorageQuota>;
  /** Admin override — sets this exact limit, creating the subject's row (with usedBytes starting
   * at 0) if it doesn't exist yet, or updating the limit on an existing row without touching
   * usedBytes. Distinct from getOrCreate, which only ever applies the configured *default* limit
   * and is a no-op once a row already exists. */
  setLimit(
    subjectType: QuotaSubjectType,
    subjectId: string,
    limitBytes: string,
  ): Promise<StorageQuota>;
  /** Atomic conditional increment (`usedBytes + delta <= limitBytes` in the WHERE clause, not a
   * read-then-write) — returns the updated row, or null if the reservation would exceed the
   * limit. Two concurrent reservations for the same subject can't both succeed past the limit. */
  tryReserve(
    subjectType: QuotaSubjectType,
    subjectId: string,
    deltaBytes: string,
  ): Promise<StorageQuota | null>;
  /** Atomic decrement, floored at 0. Always succeeds (a release is never itself rejected). */
  release(
    subjectType: QuotaSubjectType,
    subjectId: string,
    deltaBytes: string,
  ): Promise<StorageQuota>;
  updateLastNotifiedThreshold(
    subjectType: QuotaSubjectType,
    subjectId: string,
    threshold: number,
  ): Promise<void>;
  /** Sums StorageObject.size grouped by contentType for everything currently counted toward this
   * subject's usedBytes (reserved-and-not-yet-released — i.e. excludes ABORTED/FAILED/
   * QUARANTINED objects, whose reservations were already released). */
  getBreakdownBySubject(
    subjectType: QuotaSubjectType,
    subjectId: string,
  ): Promise<StorageBreakdownEntry[]>;
}
