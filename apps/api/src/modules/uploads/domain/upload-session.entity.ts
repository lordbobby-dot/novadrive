import type { QuotaSubjectType } from '../../quota/domain/storage-quota.entity';

export type UploadStatus =
  'PENDING' | 'UPLOADING' | 'COMPLETED' | 'ABORTED' | 'FAILED' | 'QUARANTINED';

export interface UploadSession {
  id: string;
  ownerId: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  size: string;
  status: UploadStatus;
  uploadId: string | null;
  partSize: string | null;
  totalParts: number | null;
  clientChecksum: string | null;
  /** The quota subject `size` bytes were reserved against at initiate time — see
   * QuotaService.reserve. Both null only for a session created outside the real upload pipeline. */
  quotaSubjectType: QuotaSubjectType | null;
  quotaSubjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadPartRecord {
  partNumber: number;
  eTag: string;
  size: string;
}

const TARGET_PART_SIZE_BYTES = 8 * 1024 * 1024;
const S3_MAX_PARTS = 10_000;

/** Picks a part size that keeps totalParts within S3's 10,000-part-per-upload limit. */
export function computeUploadParts(sizeBytes: bigint): {
  partSize: bigint;
  totalParts: number;
} {
  if (sizeBytes <= 0n) {
    throw new Error('File size must be positive');
  }

  let partSize = BigInt(TARGET_PART_SIZE_BYTES);
  let totalParts = Number((sizeBytes + partSize - 1n) / partSize);

  if (totalParts > S3_MAX_PARTS) {
    partSize = (sizeBytes + BigInt(S3_MAX_PARTS) - 1n) / BigInt(S3_MAX_PARTS);
    totalParts = Number((sizeBytes + partSize - 1n) / partSize);
  }

  return { partSize, totalParts: Math.max(1, totalParts) };
}
