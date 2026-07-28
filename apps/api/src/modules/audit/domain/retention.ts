/** Anything logged at or before this cutoff has outlived the retention window and is eligible
 * for the purge job to delete. Pure so it's trivially unit-testable without a database or a real
 * clock — same shape as TrashModule's computeRetentionCutoff, duplicated rather than shared
 * since the two modules have no other reason to depend on each other. */
export function computeAuditLogRetentionCutoff(
  now: Date,
  retentionDays: number,
): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}
