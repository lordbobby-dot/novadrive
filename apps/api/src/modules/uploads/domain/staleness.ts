/** Anything still PENDING/UPLOADING at or before this cutoff has outlived the abandoned-upload
 * threshold and is eligible for the cleanup job to abort. Pure so it's trivially unit-testable
 * without a database or a real clock. */
export function computeAbandonedUploadCutoff(
  now: Date,
  staleHours: number,
): Date {
  return new Date(now.getTime() - staleHours * 60 * 60 * 1000);
}
