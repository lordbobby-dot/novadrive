/** Anything trashed at or before this cutoff has outlived the retention window and is eligible
 * for the cleanup job to permanently delete. Pure so it's trivially unit-testable without a
 * database or a real clock. */
export function computeRetentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}
