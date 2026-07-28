import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import { computeUploadParts } from '../domain/upload-session.entity';
import { UPLOAD_STARTED } from '../domain/upload-events';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';
import { validateUploadRequest } from '../domain/upload-validation';
import {
  STORAGE_ADAPTER,
  type PresignedPart,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import { QuotaService } from '../../quota/domain/quota.service';
import { resolveQuotaSubject } from '../../quota/domain/quota-subject.resolver';

const INITIAL_PRESIGN_BATCH = 50;

export interface InitiateUploadParams {
  ownerId: string;
  folderId: string;
  name: string;
  contentType: string;
  size: string;
  clientChecksum?: string;
}

export interface InitiateUploadResult {
  uploadId: string;
  bucket: string;
  objectKey: string;
  partSize: string;
  totalParts: number;
  parts: PresignedPart[];
}

@Injectable()
export class InitiateUploadUseCase {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly realtimeEmitter: RealtimeEmitter,
    private readonly quota: QuotaService,
  ) {}

  /** Folder lookup is unscoped — PermissionGuard has already verified `params.ownerId` (the
   * actor) has EDITOR+ on it, which may belong to someone else; the new file is still owned by
   * its creator, same "creator owns" convention CopyFileUseCase uses. */
  async execute(params: InitiateUploadParams): Promise<InitiateUploadResult> {
    validateUploadRequest(params);

    const folder = await this.folders.findByIdUnscoped(params.folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Reserved before any S3 call — a QuotaExceededException here means no multipart upload was
    // ever created, matching the acceptance criterion literally. See QuotaService.reserve.
    const quotaSubject = resolveQuotaSubject(folder);
    await this.quota.reserve(quotaSubject, params.size);

    const bucket = this.config.get('AWS_S3_BUCKET', { infer: true });
    const region = this.config.get('AWS_REGION', { infer: true });
    if (!bucket || !region) {
      throw new Error('AWS_S3_BUCKET / AWS_REGION are not configured');
    }
    const objectKey = `uploads/${params.ownerId}/${randomUUID()}`;
    const { partSize, totalParts } = computeUploadParts(BigInt(params.size));

    const session = await this.uploads.create({
      ownerId: params.ownerId,
      bucket,
      objectKey,
      region,
      contentType: params.contentType,
      size: params.size,
      partSize: partSize.toString(),
      totalParts,
      clientChecksum: params.clientChecksum,
      quotaSubjectType: quotaSubject.subjectType,
      quotaSubjectId: quotaSubject.subjectId,
    });

    const { uploadId } = await this.storage.createMultipartUpload({
      bucket,
      objectKey,
      contentType: params.contentType,
    });
    await this.uploads.setUploading(session.id, uploadId);

    const firstBatch = Array.from(
      { length: Math.min(totalParts, INITIAL_PRESIGN_BATCH) },
      (_, i) => i + 1,
    );
    const parts = await this.storage.presignUploadParts({
      bucket,
      objectKey,
      uploadId,
      partNumbers: firstBatch,
    });

    this.realtimeEmitter.emitToUser(params.ownerId, UPLOAD_STARTED, {
      uploadId: session.id,
      name: params.name,
      folderId: params.folderId,
      size: params.size,
    });

    return {
      uploadId: session.id,
      bucket,
      objectKey,
      partSize: partSize.toString(),
      totalParts,
      parts,
    };
  }
}
