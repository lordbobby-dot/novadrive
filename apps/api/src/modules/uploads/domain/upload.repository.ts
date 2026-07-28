import type { QuotaSubjectType } from '../../quota/domain/storage-quota.entity';
import { UploadPartRecord, UploadSession } from './upload-session.entity';

export const UPLOAD_REPOSITORY = Symbol('UPLOAD_REPOSITORY');

export interface CreateUploadSessionParams {
  ownerId: string;
  bucket: string;
  objectKey: string;
  region: string;
  contentType: string;
  size: string;
  partSize: string;
  totalParts: number;
  clientChecksum?: string;
  quotaSubjectType: QuotaSubjectType;
  quotaSubjectId: string;
}

export interface AddPartParams {
  storageObjectId: string;
  partNumber: number;
  eTag: string;
  size: string;
}

export interface UploadRepository {
  create(params: CreateUploadSessionParams): Promise<UploadSession>;
  findById(id: string, ownerId: string): Promise<UploadSession | null>;
  /** Every PENDING/UPLOADING session created before `olderThan` — the abandoned-upload cleanup
   * job's input, unscoped by owner since it sweeps across every user. */
  findStale(olderThan: Date): Promise<UploadSession[]>;
  setUploading(id: string, uploadId: string): Promise<UploadSession>;
  addPart(params: AddPartParams): Promise<void>;
  listParts(storageObjectId: string): Promise<UploadPartRecord[]>;
  recordETag(id: string, eTag: string): Promise<void>;
  markCompleted(id: string): Promise<UploadSession>;
  markAborted(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
  markQuarantined(id: string): Promise<void>;
  markChecksumVerified(id: string, checksum: string): Promise<void>;
}
