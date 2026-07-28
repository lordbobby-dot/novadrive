export const CHECKSUM_VERIFICATION_QUEUE = 'checksum-verification';

export interface ChecksumVerificationJob {
  storageObjectId: string;
  ownerId: string;
  /** Present together for a brand-new file; absent when versionOfFileId is set instead. */
  folderId?: string;
  name?: string;
  /** Present when this upload is a new version of an existing file rather than a new file. */
  versionOfFileId?: string;
  /** The originating HTTP request's correlation id (see CorrelationId decorator) — threaded
   * through so every log line the processor emits for this job is traceable back to the
   * `POST /uploads/:id/complete` call that spawned it. Absent only if the request had none
   * (shouldn't happen in practice — pino-http always assigns one — but never blocks processing
   * if it is). */
  correlationId?: string;
}
