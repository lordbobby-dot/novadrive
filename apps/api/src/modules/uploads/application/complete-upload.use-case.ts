import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import {
  CHECKSUM_VERIFICATION_QUEUE,
  type ChecksumVerificationJob,
} from '../infrastructure/checksum-verification.queue';

export interface CompleteUploadParams {
  uploadId: string;
  ownerId: string;
  folderId?: string;
  name?: string;
  versionOfFileId?: string;
  correlationId?: string;
}

@Injectable()
export class CompleteUploadUseCase {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @InjectQueue(CHECKSUM_VERIFICATION_QUEUE)
    private readonly queue: Queue<ChecksumVerificationJob>,
  ) {}

  /** Folder/file lookups are unscoped — PermissionGuard has already verified `params.ownerId`
   * (the actor) has EDITOR+ on whichever of folderId/versionOfFileId was supplied. */
  async execute(params: CompleteUploadParams): Promise<{ status: string }> {
    const session = await this.uploads.findById(
      params.uploadId,
      params.ownerId,
    );
    if (!session) {
      throw new NotFoundException('Upload not found');
    }
    if (session.status !== 'UPLOADING' || !session.uploadId) {
      throw new BadRequestException(
        `Upload is not in progress (status: ${session.status})`,
      );
    }

    if (params.versionOfFileId) {
      const file = await this.files.findByIdUnscoped(params.versionOfFileId);
      if (!file) {
        throw new NotFoundException('File not found');
      }
    } else if (params.folderId && params.name) {
      const folder = await this.folders.findByIdUnscoped(params.folderId);
      if (!folder) {
        throw new NotFoundException('Folder not found');
      }
    } else {
      throw new BadRequestException(
        'Either versionOfFileId, or both folderId and name, must be provided',
      );
    }

    const parts = await this.uploads.listParts(session.id);
    if (session.totalParts !== null && parts.length !== session.totalParts) {
      throw new BadRequestException(
        `Expected ${session.totalParts} uploaded parts, but only ${parts.length} have been reported`,
      );
    }

    const { eTag } = await this.storage.completeMultipartUpload({
      bucket: session.bucket,
      objectKey: session.objectKey,
      uploadId: session.uploadId,
      parts,
    });
    await this.uploads.recordETag(session.id, eTag);

    await this.queue.add('verify', {
      storageObjectId: session.id,
      ownerId: params.ownerId,
      folderId: params.folderId,
      name: params.name,
      versionOfFileId: params.versionOfFileId,
      correlationId: params.correlationId,
    });

    return { status: 'VERIFYING' };
  }
}
